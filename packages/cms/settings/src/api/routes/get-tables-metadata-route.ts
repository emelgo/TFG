/**
 * Lectura de Ajustes > Recursos (F2.7c): tablas gestionadas y metadato
 * completo de una tabla.
 *
 * Exigen el permiso de sistema `table` (`select` o `update`); sin él, 403
 * `SETTINGS_PERMISSION_DENIED`. Una tabla de un esquema protegido responde
 * 403 `SETTINGS_RESOURCE_PROTECTED_SCHEMA` y una que no existe (o que el
 * usuario no puede leer por RLS), 404 `SETTINGS_RESOURCE_NOT_FOUND`.
 *
 * [TFG] RF-09 · RNF-02.
 */
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { ResourceParamsSchema } from '../schemas';
import { createTableMetadataService } from '../services/table-metadata.service';
import {
  invalidSettingsInput,
  respondWithSettingsError,
} from './settings-responses';

/** Registra las rutas de lectura de Ajustes > Recursos. */
export function registerTablesMetadataManagementRouter(router: Hono) {
  createGetTablesRouter(router);
  createGetTableMetadataRouter(router);
}

function createGetTablesRouter(router: Hono) {
  return router.get('/v1/settings/resources', async (c) => {
    try {
      const service = createTableMetadataService(c);

      return c.json(await service.getTables());
    } catch (error) {
      return respondWithSettingsError(c, error, {
        fallback: 'SETTINGS_ACTION_FAILED',
        logContext: { route: 'GET /v1/settings/resources' },
      });
    }
  });
}

function createGetTableMetadataRouter(router: Hono) {
  return router.get(
    '/v1/settings/resources/:schema/:table',
    zValidator('param', ResourceParamsSchema, invalidSettingsInput('SETTINGS')),
    async (c) => {
      const { schema, table } = c.req.valid('param');

      try {
        const service = createTableMetadataService(c);

        return c.json(await service.getTableMetadata({ schema, table }));
      } catch (error) {
        return respondWithSettingsError(c, error, {
          fallback: 'SETTINGS_ACTION_FAILED',
          logContext: { schema, table },
        });
      }
    },
  );
}

/** Tablas gestionadas (cliente RPC). */
export type GetTablesMetadataRoute = ReturnType<typeof createGetTablesRouter>;

/** Metadato de una tabla (cliente RPC). */
export type GetTableMetadataRoute = ReturnType<
  typeof createGetTableMetadataRouter
>;
