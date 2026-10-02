/**
 * `PUT /v1/settings/resources/:schema/:table/relations` (F2.7c): activa o
 * etiqueta las secciones de registros relacionados de la ficha. Exige
 * `table:update`; si alguna relación enviada no existe, 400.
 *
 * [TFG] RF-09 · RNF-02.
 */
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { ResourceParamsSchema, UpdateRelationsConfigSchema } from '../schemas';
import { createTableMetadataService } from '../services/table-metadata.service';
import {
  invalidSettingsInput,
  respondWithSettingsError,
} from './settings-responses';

export function registerUpdateRelationsConfigRoute(router: Hono) {
  return router.put(
    '/v1/settings/resources/:schema/:table/relations',
    zValidator('param', ResourceParamsSchema, invalidSettingsInput('SETTINGS')),
    zValidator(
      'json',
      UpdateRelationsConfigSchema,
      invalidSettingsInput('SETTINGS'),
    ),
    async (c) => {
      const { updates } = c.req.valid('json');
      const { schema, table } = c.req.valid('param');

      try {
        const service = createTableMetadataService(c);
        const result = await service.updateRelationsConfig({
          schema,
          table,
          updates,
        });

        return c.json({ success: true as const, ...result });
      } catch (error) {
        return respondWithSettingsError(c, error, {
          fallback: 'SETTINGS_ACTION_FAILED',
          logContext: { schema, table },
        });
      }
    },
  );
}

export type UpdateRelationsConfigRoute = ReturnType<
  typeof registerUpdateRelationsConfigRoute
>;
