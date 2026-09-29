import type { Hono } from 'hono';

import { createAuthorizationService } from '@pymekit/cms-auth/services';
import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { createPermissionsService, createRolesService } from '../services';

/**
 * Register all permission-related routes
 * @param router - The Hono router
 */
export function registerPermissionsRoutes(router: Hono) {
  registerRolesRoutes(router);
  registerPermissionsManagementRoutes(router);
}

/**
 * Register roles routes
 * @param router - The Hono router
 */
function registerRolesRoutes(router: Hono) {
  registerGetRolesRoute(router);
  registerGetRolesForSharingRoute(router);
}

/**
 * Register the get roles route
 * Consolidates the roles endpoint from multiple packages
 * @param router - The Hono router
 */
function registerGetRolesRoute(router: Hono) {
  return router.get('/v1/roles', async (c) => {
    const logger = await getLogger();
    const service = createRolesService(c);

    try {
      const roles = await service.getRoles();

      return c.json({ roles });
    } catch (error) {
      logger.error(
        {
          error,
        },
        'Error getting roles',
      );

      return c.json(
        {
          success: false,
          error: getErrorMessage(error),
        },
        500,
      );
    }
  });
}

/**
 * Register the get roles for sharing route
 * Optimized endpoint for role selection dropdowns
 * @param router - The Hono router
 */
function registerGetRolesForSharingRoute(router: Hono) {
  return router.get('/v1/roles/sharing', async (c) => {
    const logger = await getLogger();
    const service = createRolesService(c);

    try {
      const roles = await service.getRolesForSharing();

      return c.json({ roles });
    } catch (error) {
      logger.error(
        {
          error,
        },
        'Error getting roles for sharing',
      );

      return c.json(
        {
          success: false,
          error: getErrorMessage(error),
        },
        500,
      );
    }
  });
}

/**
 * Register permission management routes
 * @param router - The Hono router
 */
function registerPermissionsManagementRoutes(router: Hono) {
  registerGetPermissionsRoute(router);
}

/**
 * Register the get permissions route
 * Consolidates permissions, roles, and groups with access rights
 * @param router - The Hono router
 */
function registerGetPermissionsRoute(router: Hono) {
  return router.get('/v1/permissions', async (c) => {
    const permissionsService = createPermissionsService(c);
    const rolesService = createRolesService(c);
    const authorizationService = createAuthorizationService(c);
    const logger = await getLogger();

    try {
      // Get roles, permissions, and permission groups in parallel
      const [roles, permissions, permissionGroups, access] = await Promise.all([
        rolesService.getRoles(),
        permissionsService.getPermissions(),
        permissionsService.getPermissionGroups(),
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
        'Error getting permissions data',
      );

      return c.json(
        {
          success: false,
          error: getErrorMessage(error),
        },
        500,
      );
    }
  });
}

// Export route types for client-side usage
export type GetRolesRoute = ReturnType<typeof registerGetRolesRoute>;
export type GetRolesForSharingRoute = ReturnType<
  typeof registerGetRolesForSharingRoute
>;
export type GetPermissionsRoute = ReturnType<
  typeof registerGetPermissionsRoute
>;
