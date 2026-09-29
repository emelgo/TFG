import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { UpdateRelationsConfigSchema } from '../schemas';
import { createTableMetadataService } from '../services/table-metadata.service';

/**
 * Register the relations config update route
 * PUT /v1/settings/resources/:schema/:table/relations
 */
export function registerUpdateRelationsConfigRoute(router: Hono) {
  return router.put(
    '/v1/settings/resources/:schema/:table/relations',
    zValidator('json', UpdateRelationsConfigSchema),
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
          updateCount: data.updates.length,
        },
        'Updating relations config...',
      );

      try {
        const service = createTableMetadataService(c);

        // Check permissions before attempting update
        const permissions = await service.getPermissions();

        if (!permissions.canUpdate) {
          logger.warn(
            { schema, table },
            'Permission denied: user cannot update table metadata',
          );

          return c.json(
            {
              success: false,
              error:
                'Permission denied: you do not have permission to update table settings',
            },
            403,
          );
        }

        const response = await service.updateRelationsConfig({
          schema,
          table,
          updates: data.updates,
        });

        if (response.matchedCount === 0) {
          logger.warn(
            { schema, table },
            'No matching relations found for updates',
          );

          return c.json(
            {
              success: false,
              error: 'No matching relations found for the provided updates',
            },
            400,
          );
        }

        logger.info(
          {
            schema,
            table,
            matchedCount: response.matchedCount,
          },
          'Relations config updated',
        );

        return c.json({
          success: true,
          message: 'Relations config updated successfully',
          matchedCount: response.matchedCount,
          data: response.data,
        });
      } catch (error) {
        logger.error(
          {
            schema,
            table,
            error,
          },
          'Error updating relations config',
        );

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

export type UpdateRelationsConfigRoute = ReturnType<
  typeof registerUpdateRelationsConfigRoute
>;
