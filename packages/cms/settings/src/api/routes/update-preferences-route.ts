/**
 * Registra `POST /v1/account/preferences`: guarda las preferencias
 * personales del usuario del CMS (Ajustes > General, F2.7a).
 *
 * El esquema es estricto: solo acepta `timezone` (zona horaria IANA que el
 * motor reconoce). El idioma ya no es una preferencia: la interfaz solo está
 * en español (ADR-021), así que un `language` se rechaza. La zona
 * horaria se usa después en cada `Intl.DateTimeFormat` de la interfaz y un
 * valor no válido rompería el formateo de todas las fechas. Las claves que
 * no se envían se conservan. La interfaz vuelve a pedir `GET /v1/account`
 * tras guardar, y `FormatterPreferencesProvider` aplica la zona nueva.
 *
 * [TFG] RF-09 · RNF-02.
 */
import { zValidator } from '@hono/zod-validator';
import type { Hono } from 'hono';
import * as z from 'zod';

import { isValidTimeZone } from '@pymekit/cms-shared/preferences';

import { createAccountService } from '../services/account.service';
import {
  invalidSettingsInput,
  respondWithSettingsError,
} from './settings-responses';

const UpdatePreferencesSchema = z
  .object({
    timezone: z.string().max(64).refine(isValidTimeZone),
  })
  .strict();

/** Registra la ruta de guardado de preferencias. */
export function registerUpdatePreferencesRouter(router: Hono) {
  return router.post(
    '/v1/account/preferences',
    zValidator(
      'json',
      UpdatePreferencesSchema,
      invalidSettingsInput('SETTINGS'),
    ),
    async (c) => {
      const update = c.req.valid('json');

      try {
        const preferences =
          await createAccountService(c).updatePreferences(update);

        return c.json({ success: true as const, data: { preferences } });
      } catch (error) {
        return respondWithSettingsError(c, error, {
          fallback: 'SETTINGS_ACTION_FAILED',
          logContext: { route: 'preferences' },
        });
      }
    },
  );
}

export type UpdatePreferencesRoute = ReturnType<
  typeof registerUpdatePreferencesRouter
>;
