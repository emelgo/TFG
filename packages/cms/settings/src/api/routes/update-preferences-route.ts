/**
 * Registra `POST /v1/account/preferences`: guarda las preferencias
 * personales del usuario del CMS (Ajustes > General, F2.7a).
 *
 * El esquema es estricto: solo acepta `language` (etiqueta de idioma) y
 * `timezone` (zona horaria IANA que el motor reconoce), porque la zona
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

import {
  isValidLanguageTag,
  isValidTimeZone,
} from '@pymekit/cms-shared/preferences';

import { createAccountService } from '../services/account.service';
import {
  invalidSettingsInput,
  respondWithSettingsError,
} from './settings-responses';

const UpdatePreferencesSchema = z
  .object({
    language: z.string().max(16).refine(isValidLanguageTag).optional(),
    timezone: z.string().max(64).refine(isValidTimeZone).optional(),
  })
  .strict()
  .refine(
    (value) => value.language !== undefined || value.timezone !== undefined,
  );

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
