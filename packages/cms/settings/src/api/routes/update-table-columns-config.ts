import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { UpdateTableColumnsConfigSchema } from '../schemas';
import { createTableMetadataService } from '../services/table-metadata.service';

/**
 * Register the table columns config update router
 * @param router
 */
export function registerUpdateTableColumnsConfigRouter(router: Hono) {
  return router.put(
    '/v1/tables/:schema/:table/columns',
    zValidator('param', z.object({ schema: z.string(), table: z.string() })),
    zValidator('json', UpdateTableColumnsConfigSchema),
    async (c) => {
      const logger = await getLogger();
      const service = createTableMetadataService(c);
      const data = c.req.valid('json');
      const { schema, table } = c.req.valid('param');

      logger.info(
        {
          schema,
          table,
        },
        'Updating table columns config...',
      );

      try {
        const results = await service.updateTableColumnsConfig({
          table,
          schema,
          data,
        });

        logger.info(
          {
            schema,
            table,
          },
          'Table columns config updated',
        );

        return c.json({
          success: true,
          message: 'Tables columns config updated successfully',
          data: results.flat(),
        });
      } catch (error) {
        logger.error(
          {
            schema,
            table,
            error,
          },
          'Error updating tables metadata',
        );

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

export type UpdateTableColumnsConfigRoute = ReturnType<
  typeof registerUpdateTableColumnsConfigRouter
>;
