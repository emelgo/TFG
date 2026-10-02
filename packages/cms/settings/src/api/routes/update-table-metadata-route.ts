/**
 * `PUT /v1/tables/:schema/:table` (F2.7c): nombre visible, descripción,
 * formato de visualización, visibilidad, búsqueda y orden de una tabla.
 * Exige `table:update` (403) y responde 404 si la tabla no existe.
 *
 * [TFG] RF-09 · RNF-02.
 */
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { ResourceParamsSchema, TableMetadataSchema } from '../schemas';
import { createTableMetadataService } from '../services/table-metadata.service';
import {
  invalidSettingsInput,
  respondWithSettingsError,
} from './settings-responses';

export function registerUpdateTableMetadataRouter(router: Hono) {
  return router.put(
    '/v1/tables/:schema/:table',
    zValidator('param', ResourceParamsSchema, invalidSettingsInput('SETTINGS')),
    zValidator('json', TableMetadataSchema, invalidSettingsInput('SETTINGS')),
    async (c) => {
      const data = c.req.valid('json');
      const { schema, table } = c.req.valid('param');

      try {
        const service = createTableMetadataService(c);

        await service.updateTableMetadata({ schema, table, data });

        return c.json({ success: true as const });
      } catch (error) {
        return respondWithSettingsError(c, error, {
          fallback: 'SETTINGS_ACTION_FAILED',
          logContext: { schema, table },
        });
      }
    },
  );
}

export type UpdateTableMetadataRoute = ReturnType<
  typeof registerUpdateTableMetadataRouter
>;
