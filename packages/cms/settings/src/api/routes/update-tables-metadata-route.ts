/**
 * `PUT /v1/tables` (F2.7c): visibilidad y orden de varias tablas a la vez
 * (listado de Ajustes > Recursos). Todo o nada; exige `table:update`.
 *
 * [TFG] RF-09 · RNF-02.
 */
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { UpdateTablesMetadataSchema } from '../schemas';
import { createTableMetadataService } from '../services/table-metadata.service';
import {
  invalidSettingsInput,
  respondWithSettingsError,
} from './settings-responses';

export function registerUpdateTablesRouter(router: Hono) {
  return router.put(
    '/v1/tables',
    zValidator(
      'json',
      UpdateTablesMetadataSchema,
      invalidSettingsInput('SETTINGS'),
    ),
    async (c) => {
      const data = c.req.valid('json');

      try {
        const service = createTableMetadataService(c);
        const result = await service.updateTablesMetadata(data);

        return c.json({ success: true as const, ...result });
      } catch (error) {
        return respondWithSettingsError(c, error, {
          fallback: 'SETTINGS_ACTION_FAILED',
          logContext: { tables: data.length },
        });
      }
    },
  );
}

export type UpdateTablesMetadataRoute = ReturnType<
  typeof registerUpdateTablesRouter
>;
