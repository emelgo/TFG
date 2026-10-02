/**
 * `PUT /v1/tables/:schema/:table/columns` (F2.7c): cambios de presentación
 * de columnas existentes (etiqueta, visibilidad, orden, editable y
 * formateador). Exige `table:update`; una columna desconocida es 400.
 *
 * [TFG] RF-09 · RNF-02.
 */
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import {
  ResourceParamsSchema,
  UpdateTableColumnsConfigSchema,
} from '../schemas';
import { createTableMetadataService } from '../services/table-metadata.service';
import {
  invalidSettingsInput,
  respondWithSettingsError,
} from './settings-responses';

export function registerUpdateTableColumnsConfigRouter(router: Hono) {
  return router.put(
    '/v1/tables/:schema/:table/columns',
    zValidator('param', ResourceParamsSchema, invalidSettingsInput('SETTINGS')),
    zValidator(
      'json',
      UpdateTableColumnsConfigSchema,
      invalidSettingsInput('SETTINGS'),
    ),
    async (c) => {
      const data = c.req.valid('json');
      const { schema, table } = c.req.valid('param');

      try {
        const service = createTableMetadataService(c);
        const result = await service.updateTableColumnsConfig({
          schema,
          table,
          data,
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

export type UpdateTableColumnsConfigRoute = ReturnType<
  typeof registerUpdateTableColumnsConfigRouter
>;
