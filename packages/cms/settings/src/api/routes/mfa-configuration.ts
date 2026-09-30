/**
 * Rutas de Ajustes > Autenticación: la obligación de MFA para todo el
 * personal del CMS (`cms.configuration.requires_mfa`, F2.7a).
 *
 *  - `GET /v1/configuration/mfa`: estado actual y lo que el usuario puede
 *    hacer con él. Exige permiso `system_setting` (lectura o escritura).
 *  - `PUT /v1/configuration/mfa`: lo cambia. Exige `system_setting:update`
 *    y sesión aal2; desactivarlo exige además ser cuenta raíz (super-admin
 *    de la plataforma).
 *
 * La API comprueba todo esto antes de escribir para responder con el motivo
 * exacto (`SETTINGS_*`), pero la autoridad es la base de datos: la política
 * RLS de `cms.configuration` exige `system_setting:update` y el *trigger*
 * `cms.guard_mfa_requirement_change` exige cuenta raíz y aal2 para
 * desactivarlo. El cambio queda en la auditoría como aviso.
 *
 * Una opción ausente o con un valor no válido cuenta como «obligatorio»,
 * igual que en `cms.verify_admin_access` (falla en cerrado, bitácora B-06).
 *
 * [TFG] RNF-02 · ADR-014 · ADR-016.
 */
import { zValidator } from '@hono/zod-validator';
import { sql } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import * as z from 'zod';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import { checkIsMfaEnabled } from '@pymekit/cms-supabase/check-requires-mfa';
import { getSupabaseClient } from '@pymekit/cms-supabase/hono';

import { createConfigurationService } from '../services/configuration.service';
import {
  SettingsError,
  fromMfaConfigurationDbError,
} from '../utils/settings-errors';
import {
  invalidSettingsInput,
  respondWithSettingsError,
} from './settings-responses';

const UpdateMfaConfigurationSchema = z
  .object({ requiresMfa: z.boolean() })
  .strict();

/** Registra las dos rutas de la configuración de MFA. */
export function registerMfaConfigurationRouter(router: Hono) {
  return router
    .get('/v1/configuration/mfa', async (c) => {
      try {
        const [access, sessionIsAal2, value] = await Promise.all([
          readMfaSettingsAccess(c),
          checkIsMfaEnabled(getSupabaseClient(c)),
          createConfigurationService(c).getConfigurationValue('requires_mfa'),
        ]);

        if (!access.canRead) {
          throw new SettingsError(
            CMS_API_ERROR_CODES.SETTINGS_PERMISSION_DENIED,
            'Missing system_setting permission',
          );
        }

        return c.json({
          success: true as const,
          data: {
            requiresMfa: value?.toLowerCase() !== 'false',
            canUpdate: access.canUpdate,
            canDisable: access.canUpdate && access.isRoot && sessionIsAal2,
            isRoot: access.isRoot,
            sessionIsAal2,
          },
        });
      } catch (error) {
        return respondWithSettingsError(c, error, {
          fallback: 'SETTINGS_ACTION_FAILED',
          logContext: { route: 'mfa-configuration:get' },
        });
      }
    })
    .put(
      '/v1/configuration/mfa',
      zValidator(
        'json',
        UpdateMfaConfigurationSchema,
        invalidSettingsInput('SETTINGS'),
      ),
      async (c) => {
        const { requiresMfa } = c.req.valid('json');

        try {
          const [access, sessionIsAal2] = await Promise.all([
            readMfaSettingsAccess(c),
            checkIsMfaEnabled(getSupabaseClient(c)),
          ]);

          if (!access.canUpdate) {
            throw new SettingsError(
              CMS_API_ERROR_CODES.SETTINGS_PERMISSION_DENIED,
              'Missing system_setting:update permission',
            );
          }

          if (!sessionIsAal2) {
            throw new SettingsError(
              CMS_API_ERROR_CODES.SETTINGS_MFA_VERIFICATION_REQUIRED,
              'Session is not aal2',
            );
          }

          if (!requiresMfa && !access.isRoot) {
            throw new SettingsError(
              CMS_API_ERROR_CODES.SETTINGS_MFA_DISABLE_REQUIRES_ROOT,
              'Only a root account can disable MFA',
            );
          }

          try {
            await createConfigurationService(c).updateMfaConfiguration(
              requiresMfa,
            );
          } catch (error) {
            throw fromMfaConfigurationDbError(error) ?? error;
          }

          return c.json({ success: true as const, data: { requiresMfa } });
        } catch (error) {
          return respondWithSettingsError(c, error, {
            fallback: 'SETTINGS_ACTION_FAILED',
            logContext: { route: 'mfa-configuration:put', requiresMfa },
          });
        }
      },
    );
}

export type MfaConfigurationRoute = ReturnType<
  typeof registerMfaConfigurationRouter
>;

/**
 * Permisos del usuario sobre la configuración global, calculados con las
 * mismas funciones SQL que usan la política RLS y la guardia.
 */
async function readMfaSettingsAccess(c: Context) {
  const rows = await c.get('drizzle').runTransaction(async (tx) =>
    tx.execute(sql`
      select
        (
          cms.has_admin_permission('system_setting'::cms.system_resource, 'select'::cms.system_action)
          or cms.has_admin_permission('system_setting'::cms.system_resource, 'update'::cms.system_action)
        ) as can_read,
        cms.has_admin_permission('system_setting'::cms.system_resource, 'update'::cms.system_action) as can_update,
        coalesce(cms.is_root_managed_account(cms.get_current_user_account_id()), false) as is_root
    `),
  );

  const row = rows[0] as
    | { can_read: boolean | null; can_update: boolean | null; is_root: boolean }
    | undefined;

  return {
    canRead: row?.can_read === true,
    canUpdate: row?.can_update === true,
    isRoot: row?.is_root === true,
  };
}
