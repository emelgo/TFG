import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { createPermissionsService } from '../services/permissions.service';
import {
  createPermissionGroupSchema,
  updatePermissionGroupSchema,
} from './permission-groups';

/**
 * Register all permission group routes
 * @param router - The router to register the routes on
 */
export function registerPermissionGroupEndpoints(router: Hono) {
  registerCreatePermissionGroupRoute(router);
  registerUpdatePermissionGroupRoute(router);
  registerDeletePermissionGroupRoute(router);

  return router;
}

/**
 * Register the create permission group route
 * @param router - The router to register the route on
 * @returns The router with the route registered
 */
function registerCreatePermissionGroupRoute(router: Hono) {
  return router.post(
    '/v1/permissions/groups',
    zValidator('json', createPermissionGroupSchema),
    async (c) => {
      const logger = await getLogger();
      const data = c.req.valid('json');

      logger.info(
        {
          data,
        },
        'Creating permission group...',
      );

      try {
        const service = createPermissionsService(c);

        const result = await service.createPermissionGroup(data);

        logger.info(
          {
            data,
          },
          'Permission group created',
        );

        return c.json({
          success: true,
          data: result.id,
        });
      } catch (error) {
        logger.error(
          {
            data,
            error,
          },
          'Error creating permission group',
        );

        return c.json({ error: 'Failed to create permission group' }, 500);
      }
    },
  );
}

/**
 * Register the update permission group route
 * @param router - The router to register the route on
 * @returns The router with the route registered
 */
function registerUpdatePermissionGroupRoute(router: Hono) {
  return router.put(
    '/v1/permissions/groups/:id',
    zValidator('param', z.object({ id: z.string() })),
    zValidator('json', updatePermissionGroupSchema),
    async (c) => {
      const logger = await getLogger();
      const data = c.req.valid('json');
      const id = c.req.param('id');

      logger.info(
        {
          id,
          data,
        },
        'Updating permission group...',
      );

      try {
        const service = createPermissionsService(c);

        const result = await service.updatePermissionGroup(id, data);
        const response = result[0];

        logger.info(
          {
            id,
            data,
          },
          'Permission group updated',
        );

        return c.json(response);
      } catch (error) {
        logger.error(
          {
            id,
            data,
            error,
          },
          'Error updating permission group',
        );

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Register the delete permission group route
 * @param router - The router to register the route on
 * @returns The router with the route registered
 */
function registerDeletePermissionGroupRoute(router: Hono) {
  return router.delete(
    '/v1/permissions/groups/:id',
    zValidator('param', z.object({ id: z.string() })),
    async (c) => {
      const logger = await getLogger();
      const id = c.req.param('id');

      try {
        const service = createPermissionsService(c);

        // Delete the permission group
        await service.deletePermissionGroup(id);

        logger.info(
          {
            id,
          },
          'Permission group deleted',
        );

        return c.json({
          success: true,
          data: {
            id,
          },
        });
      } catch (error) {
        logger.error(
          {
            id,
            error,
          },
          'Error deleting permission group',
        );

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

export type CreatePermissionGroupRoute = ReturnType<
  typeof registerCreatePermissionGroupRoute
>;

export type UpdatePermissionGroupRoute = ReturnType<
  typeof registerUpdatePermissionGroupRoute
>;

export type DeletePermissionGroupRoute = ReturnType<
  typeof registerDeletePermissionGroupRoute
>;
