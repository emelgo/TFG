import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { TableMetadataSchema } from '../schemas';
import { createTableMetadataService } from '../services/table-metadata.service';

/**
 * Register the resources configure router
 * @param router
 */
export function registerUpdateTableMetadataRouter(router: Hono) {
  return router.put(
    '/v1/tables/:schema/:table',
    zValidator('json', TableMetadataSchema),
    zValidator(
      'param',
      z.object({
        schema: z.string().min(1),
        table: z.string().min(1),
      }),
    ),
    async (c) => {
      const logger = await getLogger();
      const data = c.req.valid('json');
      const { schema, table } = c.req.valid('param');

      logger.info(
        {
          schema,
          table,
        },
        'Updating table metadata...',
      );

      try {
        const service = createTableMetadataService(c);

        // Update the table metadata
        const response = await service.updateTableMetadata({
          table,
          schema,
          data,
        });

        logger.info(
          {
            schema,
            table,
          },
          'Table metadata updated',
        );

        return c.json({
          success: true,
          message: 'Resource configured successfully',
          data: response,
        });
      } catch (error) {
        logger.error(
          {
            schema,
            table,
            error,
          },
          'Error updating table metadata',
        );

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

export type UpdateTableMetadataRoute = ReturnType<
  typeof registerUpdateTableMetadataRouter
>;
