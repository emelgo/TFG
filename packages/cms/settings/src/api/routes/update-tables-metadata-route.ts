import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { UpdateTablesMetadataSchema } from '../schemas';
import { createTableMetadataService } from '../services/table-metadata.service';

/**
 * Register the tables metadata update router
 * @param router
 */
export function registerUpdateTablesRouter(router: Hono) {
  return router.put(
    '/v1/tables',
    zValidator('json', UpdateTablesMetadataSchema),
    async (c) => {
      const logger = await getLogger();
      const data = c.req.valid('json');

      logger.info(
        {
          data,
        },
        'Updating tables metadata...',
      );

      try {
        const service = createTableMetadataService(c);

        // update the resources
        const results = await service.updateTablesMetadata(data);

        logger.info(
          {
            data,
          },
          'Tables metadata updated',
        );

        return c.json({
          success: true,
          message: 'Tables metadata updated successfully',
          data: results.flat(),
        });
      } catch (error) {
        logger.error(
          {
            data,
            error,
          },
          'Error updating tables metadata',
        );

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

export type UpdateTablesMetadataRoute = ReturnType<
  typeof registerUpdateTablesRouter
>;
