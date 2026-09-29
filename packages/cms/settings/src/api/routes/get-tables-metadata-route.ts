import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { createTableMetadataService } from '../services/table-metadata.service';

/**
 * Register the managed tables router
 * @param router
 */
export function registerTablesMetadataManagementRouter(router: Hono) {
  createGetTablesRouter(router);
  createGetTableMetadataRouter(router);
}

/**
 * Register the managed tables router
 * @param router
 */
function createGetTablesRouter(router: Hono) {
  return router.get('/v1/settings/resources', async (c) => {
    const service = createTableMetadataService(c);
    const logger = await getLogger();

    try {
      const tablesPromise = service.getTables();
      const permissionsPromise = service.getPermissions();

      const [tables, permissions] = await Promise.all([
        tablesPromise,
        permissionsPromise,
      ]);

      return c.json({ tables, permissions });
    } catch (error) {
      logger.error(
        {
          error,
        },
        'Error getting tables',
      );

      return c.json({ error: getErrorMessage(error) }, 500);
    }
  });
}

/**
 * Register the managed table details router
 * @param router
 */
function createGetTableMetadataRouter(router: Hono) {
  return router.get(
    '/v1/settings/resources/:schema/:table',
    zValidator(
      'param',
      z.object({
        schema: z.string().min(1),
        table: z.string().min(1),
      }),
    ),
    async (c) => {
      const service = createTableMetadataService(c);
      const logger = await getLogger();
      const schema = c.req.param('schema');
      const table = c.req.param('table');

      try {
        const tableMetadataPromise = service.getTableMetadata({
          schema,
          table,
        });

        const permissionsPromise = service.getPermissions();

        const [data, permissions] = await Promise.all([
          tableMetadataPromise,
          permissionsPromise,
        ]);

        if (!data) {
          throw c.notFound();
        }

        return c.json({ data, permissions });
      } catch (error) {
        logger.error(
          {
            error,
          },
          'Error getting table metadata',
        );

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Get managed tables
 */
export type GetTablesMetadataRoute = ReturnType<typeof createGetTablesRouter>;

/**
 * Get managed table details
 */
export type GetTableMetadataRoute = ReturnType<
  typeof createGetTableMetadataRouter
>;
