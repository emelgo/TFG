import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { SyncTablesSchema } from '../schemas';
import { createTableMetadataService } from '../services/table-metadata.service';

/**
 * Register the sync managed tables route
 */
export function registerSyncManagedTablesRouter(router: Hono) {
  return router.post(
    '/v1/tables/sync',
    zValidator('json', SyncTablesSchema),
    async (c) => {
      const logger = await getLogger();
      const { schema, table } = c.req.valid('json');

      try {
        const service = createTableMetadataService(c);

        const data = await service.syncManagedTables({ schema, table });

        return c.json({
          success: true,
          message: 'Tables synced successfully',
          data,
        });
      } catch (error) {
        logger.error({ schema, table, error }, 'Error syncing tables');

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

export type SyncManagedTablesRoute = ReturnType<
  typeof registerSyncManagedTablesRouter
>;
