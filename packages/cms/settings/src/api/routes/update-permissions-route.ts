import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { createPermissionsService } from '../services/permissions.service';
import {
  AssignPermissionToRoleSchema,
  BatchUpdateRolePermissionGroupsSchema,
  BatchUpdateRolePermissionsSchema,
  CreatePermissionSchema,
  CreateRoleSchema,
  UpdatePermissionSchema,
  UpdateRoleSchema,
} from './types';

/**
 * Register the update permissions routes
 * @param router - The Hono router
 * @returns The Hono router
 */
export function registerUpdatePermissionsRouter(router: Hono) {
  // Create/Update Roles
  registerCreateRoleRoute(router);
  registerUpdateRoleRoute(router);
  registerDeleteRoleRoute(router);

  // Create/Update Permissions
  registerCreatePermissionRoute(router);
  registerUpdatePermissionRoute(router);
  registerDeletePermissionRoute(router);

  // Role-Permission assignments
  registerAssignPermissionToRoleRoute(router);
  registerRemovePermissionFromRoleRoute(router);

  // Batch update role permissions
  registerBatchUpdateRolePermissionsRoute(router);
  registerBatchUpdateRolePermissionGroupsRoute(router);
}

/**
 * Register the create role route
 * @param router - The Hono router
 * @returns The Hono router
 */
function registerCreateRoleRoute(router: Hono) {
  return router.post(
    '/v1/permissions/roles',
    zValidator('json', CreateRoleSchema),
    async (c) => {
      const data = c.req.valid('json');
      const service = createPermissionsService(c);
      const logger = await getLogger();

      try {
        const role = await service.createRole(data);

        return c.json({
          success: true,
          data: role[0]!,
        });
      } catch (error) {
        logger.error(
          {
            error,
          },
          'Error creating role',
        );

        return c.json(
          {
            success: false,
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/**
 * Register the update role route
 * @param router - The Hono router
 * @returns The Hono router
 */
function registerUpdateRoleRoute(router: Hono) {
  return router.put(
    '/v1/permissions/roles/:id',
    zValidator('json', UpdateRoleSchema),
    async (c) => {
      const logger = await getLogger();
      const data = c.req.valid('json');
      const id = c.req.param('id');

      try {
        const service = createPermissionsService(c);

        // Update the role
        const role = await service.updateRole(id, data);

        logger.info(
          {
            roleId: id,
            roleName: data.name,
          },
          'Role updated',
        );

        return c.json({
          success: true,
          data: role[0],
        });
      } catch (error) {
        logger.error(
          {
            roleId: id,
            roleName: data.name,
            error,
          },
          'Error updating role',
        );

        return c.json(
          {
            success: false,
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/**
 * Register the delete role route
 * @param router - The Hono router
 * @returns The Hono router
 */
function registerDeleteRoleRoute(router: Hono) {
  return router.delete(
    '/v1/permissions/roles/:id',
    zValidator('param', z.object({ id: z.string() })),
    async (c) => {
      const id = c.req.param('id');
      const service = createPermissionsService(c);
      const logger = await getLogger();

      logger.info(
        {
          roleId: id,
        },
        'Deleting role...',
      );

      try {
        const role = await service.deleteRole(id);

        logger.info(
          {
            roleId: id,
          },
          'Role deleted',
        );

        return c.json({
          success: true,
          data: role[0],
        });
      } catch (error) {
        logger.error(
          {
            roleId: id,
            error,
          },
          'Error deleting role',
        );

        return c.json({ success: false, error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Register the create permission route
 * @param router
 */
function registerCreatePermissionRoute(router: Hono) {
  return router.post(
    '/v1/permissions',
    zValidator('json', CreatePermissionSchema),
    async (c) => {
      const logger = await getLogger();
      const data = c.req.valid('json');

      try {
        const service = createPermissionsService(c);

        // Create the permission
        const permission = await service.createPermission(data);

        logger.info(
          {
            permissionId: permission[0]?.id,
            permissionName: permission[0]?.name,
          },
          'Permission created',
        );

        return c.json({
          success: true,
          data: permission[0],
        });
      } catch (error) {
        logger.error(
          {
            error,
          },
          'Error creating permission',
        );

        return c.json(
          {
            success: false,
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/**
 * Register the update permission route
 * @param router - The Hono router
 * @returns The Hono router
 */
function registerUpdatePermissionRoute(router: Hono) {
  return router.put(
    '/v1/permissions/:id',
    zValidator('json', UpdatePermissionSchema),
    async (c) => {
      const logger = await getLogger();
      const data = c.req.valid('json');
      const id = c.req.param('id');

      logger.info(
        {
          permissionId: id,
          permissionName: data.name,
        },
        'Updating permission...',
      );

      try {
        const service = createPermissionsService(c);
        const permission = await service.updatePermission(id, data);

        logger.info(
          {
            permissionId: id,
            permissionName: data.name,
          },
          'Permission updated',
        );

        return c.json({
          success: true,
          data: permission[0],
        });
      } catch (error) {
        logger.error(
          {
            permissionId: id,
            permissionName: data.name,
            error,
          },
          'Error updating permission',
        );

        return c.json(
          {
            success: false,
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/**
 * Register the delete permission route
 * @param router - The Hono router
 * @returns The Hono router
 */
function registerDeletePermissionRoute(router: Hono) {
  return router.delete(
    '/v1/permissions/:id',
    // validate the id param so a malformed (non-UUID) id is
    // rejected with a 400 instead of reaching the query and raising a 22P02 cast
    // error. Brings #20 in line with the other permission mutation routes.
    zValidator('param', z.object({ id: z.string().uuid() })),
    async (c) => {
      const id = c.req.param('id');
      const logger = await getLogger();

      logger.info(
        {
          permissionId: id,
        },
        'Deleting permission...',
      );

      try {
        const service = createPermissionsService(c);

        // Delete the permission
        const permission = await service.deletePermission(id);

        logger.info(
          {
            permissionId: id,
          },
          'Permission deleted',
        );

        return c.json({
          success: true,
          data: permission[0],
        });
      } catch (error) {
        logger.error(
          {
            permissionId: id,
            error,
          },
          'Error deleting permission',
        );

        return c.json({ success: false, error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Register the assign permission to role route
 * @param router - The Hono router
 * @returns The Hono router
 */
function registerAssignPermissionToRoleRoute(router: Hono) {
  return router.post(
    '/v1/permissions/roles/:roleId/permissions',
    zValidator('json', AssignPermissionToRoleSchema),
    async (c) => {
      const logger = await getLogger();
      const data = c.req.valid('json');
      const roleId = c.req.param('roleId');

      logger.info(
        {
          roleId,
          permissionId: data.permissionId,
        },
        'Assigning permission to role...',
      );

      try {
        const service = createPermissionsService(c);

        // Assign the permission to the role
        const assignment = await service.assignPermissionToRole({
          roleId,
          permissionId: data.permissionId,
          validFrom: data.validFrom,
          validUntil: data.validUntil,
          conditions: data.conditions,
        });

        logger.info(
          {
            roleId,
            permissionId: data.permissionId,
          },
          'Permission assigned to role',
        );

        return c.json({
          success: true,
          data: assignment[0],
        });
      } catch (error) {
        logger.error(
          {
            roleId,
            permissionId: data.permissionId,
            error,
          },
          'Error assigning permission to role',
        );

        return c.json(
          {
            success: false,
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/**
 * Register the remove permission from role route
 * @param router - The Hono router
 * @returns The Hono router
 */
function registerRemovePermissionFromRoleRoute(router: Hono) {
  return router.delete(
    '/v1/permissions/roles/:roleId/permissions/:permissionId',
    async (c) => {
      const logger = await getLogger();
      const roleId = c.req.param('roleId');
      const permissionId = c.req.param('permissionId');

      logger.info(
        {
          roleId,
          permissionId,
        },
        'Removing permission from role...',
      );

      try {
        const service = createPermissionsService(c);

        // Remove the permission from the role
        const assignment = await service.removePermissionFromRole(
          roleId,
          permissionId,
        );

        logger.info(
          {
            roleId,
            permissionId,
          },
          'Permission removed from role',
        );

        return c.json({
          success: true,
          data: assignment[0],
        });
      } catch (error) {
        logger.error(
          {
            roleId,
            permissionId,
            error,
          },
          'Error removing permission from role',
        );

        return c.json(
          {
            success: false,
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/**
 * Register the batch update role permissions route
 * @param router - The Hono router
 * @returns The Hono router
 */
function registerBatchUpdateRolePermissionsRoute(router: Hono) {
  return router.patch(
    '/v1/permissions/roles/:id/batch-permissions',
    zValidator('param', z.object({ id: z.string() })),
    zValidator('json', BatchUpdateRolePermissionsSchema),
    async (c) => {
      const logger = await getLogger();
      const data = c.req.valid('json');
      const roleId = c.req.param('id');

      logger.info(
        {
          roleId,
          permissions: data.toAdd,
        },
        'Batch updating role permissions...',
      );

      try {
        const service = createPermissionsService(c);

        // Process additions
        const addPromises = data.toAdd.map((permissionId) =>
          service.assignPermissionToRole({
            roleId,
            permissionId,
          }),
        );

        // Process removals
        const removePromises = data.toRemove.map((permissionId) =>
          service.removePermissionFromRole(roleId, permissionId),
        );

        // Execute all operations
        await Promise.all([...addPromises, ...removePromises]);

        // Get updated permissions
        const updatedPermissions = await service.getRolePermissions(roleId);

        logger.info(
          {
            roleId,
            permissions: updatedPermissions.map((p) => p.permission),
          },
          'Role permissions updated',
        );

        return c.json({
          success: true,
          message: 'Role permissions updated successfully',
          permissions: updatedPermissions.map((p) => p.permission),
        });
      } catch (error) {
        logger.error(
          {
            roleId,
            error,
          },
          'Error batch updating role permissions',
        );

        return c.json(
          {
            success: false,
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/**
 * Register the batch update role permission groups route
 * @param router - The Hono router
 * @returns The Hono router
 */
function registerBatchUpdateRolePermissionGroupsRoute(router: Hono) {
  return router.patch(
    '/v1/permissions/roles/:id/batch-permission-groups',
    zValidator('param', z.object({ id: z.string() })),
    zValidator('json', BatchUpdateRolePermissionGroupsSchema),
    async (c) => {
      const logger = await getLogger();
      const data = c.req.valid('json');
      const roleId = c.req.param('id');
      const service = createPermissionsService(c);

      logger.info(
        {
          roleId,
          permissionGroups: data.toAdd,
        },
        'Batch updating role permission groups...',
      );

      try {
        // Process additions
        const addPromises = data.toAdd.map((groupId) =>
          service.assignPermissionGroupToRole({
            roleId,
            groupId,
          }),
        );

        // Process removals
        const removePromises = data.toRemove.map((groupId) =>
          service.removePermissionGroupFromRole(roleId, groupId),
        );

        // Execute all operations
        await Promise.all([...addPromises, ...removePromises]);

        // Get updated permission groups
        const updatedGroups = await service.getRolePermissionGroups(roleId);

        logger.info(
          {
            roleId,
            permissionGroups: updatedGroups,
          },
          'Role permission groups updated',
        );

        return c.json({
          success: true,
          message: 'Role permission groups updated successfully',
          permissionGroups: updatedGroups,
        });
      } catch (error) {
        logger.error(
          {
            roleId,
            error,
          },
          'Error batch updating role permission groups',
        );

        return c.json(
          {
            success: false,
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

export type CreateRoleRoute = ReturnType<typeof registerCreateRoleRoute>;
export type UpdateRoleRoute = ReturnType<typeof registerUpdateRoleRoute>;
export type DeleteRoleRoute = ReturnType<typeof registerDeleteRoleRoute>;

export type CreatePermissionRoute = ReturnType<
  typeof registerCreatePermissionRoute
>;

export type UpdatePermissionRoute = ReturnType<
  typeof registerUpdatePermissionRoute
>;

export type DeletePermissionRoute = ReturnType<
  typeof registerDeletePermissionRoute
>;

export type AssignPermissionToRoleRoute = ReturnType<
  typeof registerAssignPermissionToRoleRoute
>;

export type RemovePermissionFromRoleRoute = ReturnType<
  typeof registerRemovePermissionFromRoleRoute
>;

export type BatchUpdateRolePermissionsRoute = ReturnType<
  typeof registerBatchUpdateRolePermissionsRoute
>;

export type BatchUpdateRolePermissionGroupsRoute = ReturnType<
  typeof registerBatchUpdateRolePermissionGroupsRoute
>;
