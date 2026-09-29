import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Context, Hono } from 'hono';
import { z } from 'zod';

import { createAuthorizationService } from '@pymekit/cms-auth/services';
import { createPermissionsService } from '@pymekit/cms-permissions/services';
import { getErrorMessage } from '@pymekit/cms-shared/utils';
import {
  permissionGroupPermissionsInCms,
  permissionGroupsInCms,
  rolePermissionsInCms,
  rolesInCms,
} from '@pymekit/cms-supabase/schema';
import { getLogger } from '@pymekit/shared/logger';

/**
 * Register the get permissions route
 * @param router - The router to register the route on
 * @returns The router with the route registered
 */
function registerGetPermissionsRoute(router: Hono) {
  return router.get('/v1/permissions', async (c) => {
    const service = createPermissionsService(c);
    const authorizationService = createAuthorizationService(c);
    const logger = await getLogger();

    try {
      // Get roles, permissions, and permission groups in parallel
      const [roles, permissions, permissionGroups, access] = await Promise.all([
        service.getRoles(),
        service.getPermissions(),
        service.getPermissionGroups(),
        authorizationService.getAccessRights(),
      ]);

      return c.json({
        roles,
        permissions,
        permissionGroups,
        access,
      });
    } catch (error) {
      logger.error(
        {
          error,
        },
        'Error fetching permissions',
      );

      return c.json({ error: getErrorMessage(error) }, 500);
    }
  });
}

/**
 * Register the get role permissions route
 * @param router - The router to register the route on
 * @returns The router with the route registered
 */
function registerGetRolePermissionsRoute(router: Hono) {
  return router.get(
    '/v1/permissions/roles/:id',
    zValidator('param', z.object({ id: z.string() })),
    async (c) => {
      const service = createPermissionsService(c);
      const authorizationService = createAuthorizationService(c);
      const id = c.req.param('id');
      const logger = await getLogger();

      try {
        const [data, access] = await Promise.all([
          service.getRole(id),
          authorizationService.getRoleAccessRights(id),
        ]);

        return c.json({
          ...data,
          access,
        });
      } catch (error) {
        logger.error(
          {
            id,
            error,
          },
          'Error fetching role permissions',
        );

        return c.json(
          {
            error: 'Error fetching role permissions',
          },
          500,
        );
      }
    },
  );
}

/**
 * Register the get permission group permissions route
 * @param router - The router to register the route on
 * @returns The router with the route registered
 */
function registerGetPermissionGroupPermissionsRoute(router: Hono) {
  return router.get(
    '/v1/permissions/groups/:id',
    zValidator('param', z.object({ id: z.string() })),
    async (c) => {
      const service = createPermissionsService(c);
      const authorizationService = createAuthorizationService(c);
      const id = c.req.param('id');
      const logger = await getLogger();

      try {
        const [group, permissions, roles, access] = await Promise.all([
          service.getPermissionGroup(id),
          service.getPermissionGroupPermissions(id),
          service.getPermissionGroupRoles(id),
          authorizationService.getPermissionGroupAccessRights(id),
        ]);

        if (!group) {
          throw c.notFound();
        }

        return c.json({
          group,
          permissions: permissions.map((p) => p.permission),
          roles,
          access,
        });
      } catch (error) {
        logger.error(
          {
            id,
            error,
          },
          'Error fetching permission group details',
        );

        return c.json(
          { error: 'Failed to fetch permission group details' },
          500,
        );
      }
    },
  );
}

/**
 * Register the get permission details route
 * @param router - The router to register the route on
 * @returns The router with the route registered
 */
function registerGetPermissionDetailsRoute(router: Hono) {
  return router.get(
    '/v1/permissions/:id',
    zValidator('param', z.object({ id: z.string() })),
    async (c) => {
      const service = createPermissionsService(c);
      const authorizationService = createAuthorizationService(c);
      const logger = await getLogger();

      const id = c.req.valid('param').id;

      try {
        const [data, access] = await Promise.all([
          service.getPermissionWithRelations(id),
          authorizationService.getPermissionEntityAccessRights(id),
        ]);

        return c.json({
          ...data,
          access,
        });
      } catch (error) {
        logger.error(
          {
            id,
            error,
          },
          'Error fetching permission details',
        );

        return c.json({ error: 'Failed to fetch permission details' }, 500);
      }
    },
  );
}

/**
 * Handler for GET /api/permissions/roles/:id/all
 * Returns all permissions with their assignment status for the specified role
 */
async function getAllPermissionsWithStatusHandler(c: Context) {
  const roleId = c.req.param('id');
  const service = createPermissionsService(c);
  const logger = await getLogger();

  if (!roleId) {
    throw new Error(`Role ID was not found in params`);
  }

  try {
    // Get all permissions
    const allPermissions = await service.getPermissions();

    // Get permissions assigned to the role
    const rolePermissions = await service.getRolePermissions(roleId);

    // Create a set of assigned permission IDs for quick lookup
    const assignedPermissionIds = new Set(
      rolePermissions.map((rp) => rp.permission.id),
    );

    // Mark permissions as assigned or not
    const permissionsWithStatus = allPermissions.map((permission) => ({
      ...permission,
      isAssigned: assignedPermissionIds.has(permission.id),
    }));

    return c.json({
      permissions: permissionsWithStatus,
    });
  } catch (error) {
    logger.error(
      {
        error,
      },
      'Error fetching permissions with status',
    );

    return c.json({ error: 'Failed to fetch permissions with status' }, 500);
  }
}

/**
 * Register the get all permissions with status route
 * @param router - The router to register the route on
 * @returns The router with the route registered
 */
function registerGetAllPermissionsWithStatusRoute(router: Hono) {
  return router.get(
    '/v1/permissions/roles/:id/all',
    getAllPermissionsWithStatusHandler,
  );
}

/**
 * Register the get roles using permission route
 * @param router - The router to register the route on
 * @returns The router with the route registered
 */
function registerGetRolesUsingPermissionRoute(router: Hono) {
  return router.get(
    '/v1/permissions/:id/roles',
    zValidator('param', z.object({ id: z.string() })),
    async (c) => {
      const logger = await getLogger();
      const id = c.req.param('id');
      const client = c.get('drizzle');

      try {
        logger.info(
          {
            id,
          },
          'Fetching roles using permission',
        );

        // Use a transaction to get all roles that use this permission
        const roles = await client.runTransaction(async (tx) => {
          return tx
            .select({
              id: rolesInCms.id,
              name: rolesInCms.name,
              description: rolesInCms.description,
              rank: rolesInCms.rank,
            })
            .from(rolePermissionsInCms)
            .innerJoin(
              rolesInCms,
              eq(rolePermissionsInCms.roleId, rolesInCms.id),
            )
            .where(eq(rolePermissionsInCms.permissionId, id));
        });

        logger.info(
          {
            id,
            roles,
          },
          'Fetched roles using permission',
        );

        return c.json({ roles });
      } catch (error) {
        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Register the get groups using permission route
 * @param router - The router to register the route on
 * @returns The router with the route registered
 */
function registerGetGroupsUsingPermissionRoute(router: Hono) {
  return router.get(
    '/v1/permissions/:id/groups',
    zValidator('param', z.object({ id: z.string() })),
    async (c) => {
      const id = c.req.param('id');
      const client = c.get('drizzle');
      const logger = await getLogger();

      try {
        // Use a transaction to get all groups that use this permission
        const groups = await client.runTransaction(async (tx) => {
          return tx
            .select({
              id: permissionGroupsInCms.id,
              name: permissionGroupsInCms.name,
              description: permissionGroupsInCms.description,
            })
            .from(permissionGroupPermissionsInCms)
            .innerJoin(
              permissionGroupsInCms,
              eq(
                permissionGroupPermissionsInCms.groupId,
                permissionGroupsInCms.id,
              ),
            )
            .where(eq(permissionGroupPermissionsInCms.permissionId, id));
        });

        return c.json({ groups });
      } catch (error) {
        logger.error(
          {
            id,
            error,
          },
          'Error fetching groups using permission',
        );

        return c.json({ error: 'Failed to fetch groups', groups: [] }, 500);
      }
    },
  );
}

/**
 * Register batch update permissions for a group route
 * @param router - The router to register the route on
 * @returns The router with the route registered
 */
function registerBatchUpdateGroupPermissionsRoute(router: Hono) {
  return router.put(
    '/v1/permissions/groups/:id/permissions',
    zValidator('param', z.object({ id: z.string() })),
    zValidator(
      'json',
      z.object({
        toAdd: z.array(z.string()),
        toRemove: z.array(z.string()),
      }),
    ),
    async (c) => {
      const logger = await getLogger();
      const groupId = c.req.param('id');
      const { toAdd, toRemove } = c.req.valid('json');
      const service = createPermissionsService(c);

      logger.info(
        {
          groupId,
          toAdd,
          toRemove,
        },
        'Batch updating group permissions...',
      );

      try {
        await service.batchUpdateGroupPermissions(groupId, {
          toAdd,
          toRemove,
        });

        logger.info(
          {
            groupId,
            toAdd,
            toRemove,
          },
          'Batch updated group permissions',
        );

        // Return updated permissions
        const permissions =
          await service.getPermissionGroupPermissions(groupId);

        return c.json({
          success: true,
          permissions: permissions.map((p) => p.permission),
        });
      } catch (error) {
        logger.error(
          {
            groupId,
            toAdd,
            toRemove,
          },
          'Error updating group permissions',
        );

        return c.json(
          {
            error: getErrorMessage(error),
            success: false,
          },
          500,
        );
      }
    },
  );
}

/**
 * Creates the router for permissions
 */
export function registerPermissionsRouter(router: Hono) {
  registerGetPermissionsRoute(router);
  registerGetRolePermissionsRoute(router);
  registerGetPermissionGroupPermissionsRoute(router);
  registerGetAllPermissionsWithStatusRoute(router);
  registerGetPermissionDetailsRoute(router);
  registerGetRolesUsingPermissionRoute(router);
  registerGetGroupsUsingPermissionRoute(router);
  registerBatchUpdateGroupPermissionsRoute(router);
}

export type GetPermissionsRoute = ReturnType<
  typeof registerGetPermissionsRoute
>;

export type GetRolePermissionsRoute = ReturnType<
  typeof registerGetRolePermissionsRoute
>;

export type GetPermissionGroupPermissionsRoute = ReturnType<
  typeof registerGetPermissionGroupPermissionsRoute
>;

export type GetAllPermissionsWithStatusRoute = ReturnType<
  typeof registerGetAllPermissionsWithStatusRoute
>;

export type GetPermissionDetailsRoute = ReturnType<
  typeof registerGetPermissionDetailsRoute
>;

export type BatchUpdateGroupPermissionsRoute = ReturnType<
  typeof registerBatchUpdateGroupPermissionsRoute
>;
