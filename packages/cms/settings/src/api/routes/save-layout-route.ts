/**
 * `POST /v1/resources/:schema/:table/layout` (F2.7c): guarda la
 * distribución de la ficha de un registro (`ui_config.recordLayout`) o la
 * borra con `layout: null`. Exige `table:update`; el esquema es estricto
 * (sin `metadata` libre, con límites de grupos, filas y campos) y solo
 * admite columnas de la tabla.
 *
 * [TFG] RF-09 · RNF-02.
 */
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { ResourceParamsSchema, SaveLayoutSchema } from '../schemas';
import { createTableMetadataService } from '../services/table-metadata.service';
import {
  invalidSettingsInput,
  respondWithSettingsError,
} from './settings-responses';

export function registerSaveLayoutRouter(router: Hono) {
  createSaveLayoutRouter(router);
}

function createSaveLayoutRouter(router: Hono) {
  return router.post(
    '/v1/resources/:schema/:table/layout',
    zValidator('param', ResourceParamsSchema, invalidSettingsInput('SETTINGS')),
    zValidator('json', SaveLayoutSchema, invalidSettingsInput('SETTINGS')),
    async (c) => {
      const { schema, table } = c.req.valid('param');
      const { layout } = c.req.valid('json');

      try {
        const service = createTableMetadataService(c);
        const result = await service.saveLayout({ schema, table, layout });

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

export type SaveLayoutRoute = ReturnType<typeof createSaveLayoutRouter>;
