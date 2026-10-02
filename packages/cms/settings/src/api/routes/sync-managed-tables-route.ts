/**
 * `POST /v1/tables/sync` (F2.7c): vuelve a leer del catálogo las tablas de
 * un esquema (o una sola) y actualiza su metadato. Exige `table:update`;
 * los esquemas protegidos responden 403
 * `SETTINGS_RESOURCE_PROTECTED_SCHEMA` sin llegar a la base de datos.
 *
 * [TFG] RF-09 · RNF-02.
 */
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { SyncTablesSchema } from '../schemas';
import { createTableMetadataService } from '../services/table-metadata.service';
import {
  invalidSettingsInput,
  respondWithSettingsError,
} from './settings-responses';

export function registerSyncManagedTablesRouter(router: Hono) {
  return router.post(
    '/v1/tables/sync',
    zValidator('json', SyncTablesSchema, invalidSettingsInput('SETTINGS')),
    async (c) => {
      const { schema, table } = c.req.valid('json');

      try {
        const service = createTableMetadataService(c);
        const data = await service.syncManagedTables({ schema, table });

        return c.json({ success: true as const, data });
      } catch (error) {
        return respondWithSettingsError(c, error, {
          fallback: 'SETTINGS_ACTION_FAILED',
          logContext: { schema, table },
        });
      }
    },
  );
}

export type SyncManagedTablesRoute = ReturnType<
  typeof registerSyncManagedTablesRouter
>;
