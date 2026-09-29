import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { createAdminUserService } from '../services/admin-user.service';
import { createAuthUsersService } from '../services/auth-users.service';

/**
 * @name registerUsersExplorerRoutes
 * @description Register routes for users explorer
 * @param router - The router to register routes on
 */
export function registerUsersExplorerRoutes(router: Hono) {
  registerGetUsersRoute(router);
  registerGetUserByIdRoute(router);

  // Admin operations routes
  registerAdminRoutes(router);
}

/**
 * @name registerAdminRoutes
 * @description Register admin routes for user operations
 * @param router - The router to register routes on
 */
function registerAdminRoutes(router: Hono) {
  registerBanUserRoute(router);
  registerUnbanUserRoute(router);
  registerResetPasswordRoute(router);
  registerDeleteUserRoute(router);
  registerInviteUserRoute(router);
  registerCreateUserRoute(router);
  registerSendMagicLinkRoute(router);
  registerRemoveMfaFactorRoute(router);
  registerUpdateAdminAccessRoute(router);

  // Batch operations
  registerBatchBanUsersRoute(router);
  registerBatchUnbanUsersRoute(router);
  registerBatchResetPasswordsRoute(router);
  registerBatchDeleteUsersRoute(router);
}

/**
 * Get all users
 */
export type GetUsersRoute = ReturnType<typeof registerGetUsersRoute>;

/**
 * @name registerGetUsersRoute
 * @description Register a route for getting all users
 * @param router - The router to register the route on
 */
function registerGetUsersRoute(router: Hono) {
  return router.get(
    '/v1/users',
    zValidator(
      'query',
      z.object({
        page: z.coerce.number().optional().default(1),
        search: z.string().optional(),
      }),
    ),
    async (c) => {
      const service = createAuthUsersService(c);
      const { page, search } = c.req.valid('query');
      const logger = await getLogger();
      const pageSize = 25;

      try {
        const [{ users, total }, permissions] = await Promise.all([
          service.getUsers({
            page,
            limit: pageSize,
            search,
          }),
          service.getPermissions(),
        ]);

        const pageCount = total ? Math.ceil(total / pageSize) : 0;
        const pageIndex = page - 1;

        return c.json({
          users,
          permissions,
          pagination: {
            pageCount,
            pageIndex,
            pageSize,
            total,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to fetch users');

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Get user by ID
 */
export type GetUserByIdRoute = ReturnType<typeof registerGetUserByIdRoute>;

/**
 * @name registerGetUserByIdRoute
 * @description Register a route for getting a user by ID
 * @param router - The router to register the route on
 */
function registerGetUserByIdRoute(router: Hono) {
  return router.get(
    '/v1/users/:id',
    zValidator('param', z.object({ id: z.string().uuid() })),
    async (c) => {
      const service = createAuthUsersService(c);
      const { id } = c.req.valid('param');
      const logger = await getLogger();

      try {
        const [{ user }, permissions] = await Promise.all([
          service.getUserById(id),
          service.getPermissions(),
        ]);

        return c.json({
          data: {
            user,
            permissions,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to fetch user details');

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Ban user
 */
export type BanUserRoute = ReturnType<typeof registerBanUserRoute>;

/**
 * @name registerBanUserRoute
 * @description Register a route for banning a user
 * @param router - The router to register the route on
 */
function registerBanUserRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/:id/ban',
    zValidator('param', z.object({ id: z.string().uuid() })),
    async (c) => {
      const service = createAdminUserService(c);
      const { id } = c.req.valid('param');
      const logger = await getLogger();

      try {
        logger.info({ id }, 'Banning user...');

        const result = await service.banUser(id);

        logger.info({ id }, 'User banned successfully');

        return c.json(result);
      } catch (error) {
        logger.error({ error, userId: id }, 'Failed to ban user');

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Unban user
 */
export type UnbanUserRoute = ReturnType<typeof registerUnbanUserRoute>;

/**
 * @name registerUnbanUserRoute
 * @description Register a route for unbanning a user
 * @param router - The router to register the route on
 */
function registerUnbanUserRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/:id/unban',
    zValidator('param', z.object({ id: z.string().uuid() })),
    async (c) => {
      const service = createAdminUserService(c);
      const { id } = c.req.valid('param');
      const logger = await getLogger();

      try {
        logger.info({ id }, 'Unbanning user...');

        const result = await service.unbanUser(id);

        logger.info({ id }, 'User unbanned successfully');

        return c.json(result);
      } catch (error) {
        logger.error({ error, userId: id }, 'Failed to unban user');

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Reset password
 */
export type ResetPasswordRoute = ReturnType<typeof registerResetPasswordRoute>;

/**
 * @name registerResetPasswordRoute
 * @description Register a route for resetting a user's password
 * @param router - The router to register the route on
 */
function registerResetPasswordRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/:id/reset-password',
    zValidator('param', z.object({ id: z.string().uuid() })),
    async (c) => {
      const service = createAdminUserService(c);
      const { id } = c.req.valid('param');
      const logger = await getLogger();

      try {
        logger.info({ id }, 'Resetting password...');

        const result = await service.resetPassword(id);

        logger.info({ id }, 'Password reset successful');

        return c.json(result);
      } catch (error) {
        logger.error({ error, userId: id }, 'Failed to reset password');

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Delete user
 */
export type DeleteUserRoute = ReturnType<typeof registerDeleteUserRoute>;

/**
 * @name registerDeleteUserRoute
 * @description Register a route for deleting a user
 * @param router - The router to register the route on
 */
function registerDeleteUserRoute(router: Hono) {
  return router.delete(
    '/v1/admin/users/:id',
    zValidator('param', z.object({ id: z.string().uuid() })),
    async (c) => {
      const service = createAdminUserService(c);
      const { id } = c.req.valid('param');
      const logger = await getLogger();

      try {
        logger.info({ id }, 'Deleting user...');

        const result = await service.deleteUser(id);

        logger.info({ id }, 'User deleted successfully');

        return c.json(result);
      } catch (error) {
        logger.error({ error, userId: id }, 'Failed to delete user');

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Invite user
 */
export type InviteUserRoute = ReturnType<typeof registerInviteUserRoute>;

/**
 * @name registerInviteUserRoute
 * @description Register a route for inviting a new user
 * @param router - The router to register the route on
 */
function registerInviteUserRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/invite',
    zValidator(
      'json',
      z.object({
        email: z.string().email(),
      }),
    ),
    async (c) => {
      const service = createAdminUserService(c);
      const { email } = c.req.valid('json');
      const logger = await getLogger();

      try {
        logger.info({ email }, 'Inviting user...');

        const result = await service.inviteUser({ email });

        logger.info({ email }, 'User invited successfully');

        return c.json(result);
      } catch (error) {
        logger.error({ error, email }, 'Failed to invite user');

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Create user
 */
export type CreateUserRoute = ReturnType<typeof registerCreateUserRoute>;

/**
 * @name registerCreateUserRoute
 * @description Register a route for creating a new user
 * @param router - The router to register the route on
 */
function registerCreateUserRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/create',
    zValidator(
      'json',
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
        autoConfirm: z.boolean().default(false),
      }),
    ),
    async (c) => {
      const service = createAdminUserService(c);
      const { email, password, autoConfirm } = c.req.valid('json');
      const logger = await getLogger();

      try {
        logger.info({ email }, 'Creating user...');

        // Create user
        const result = await service.createUser({
          email,
          password,
          autoConfirm,
        });

        logger.info({ email }, 'User created successfully');

        return c.json(result);
      } catch (error) {
        logger.error({ error, email }, 'Failed to create user');

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Batch ban users
 */
export type BatchBanUsersRoute = ReturnType<typeof registerBatchBanUsersRoute>;

/**
 * @name registerBatchBanUsersRoute
 * @description Register a route for banning multiple users
 * @param router - The router to register the route on
 */
function registerBatchBanUsersRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/ban/batch',
    zValidator(
      'json',
      z.object({
        userIds: z.array(z.string().uuid()).min(1).max(50),
      }),
    ),
    async (c) => {
      const service = createAdminUserService(c);
      const { userIds } = c.req.valid('json');
      const logger = await getLogger();

      try {
        logger.info(
          { userIds, count: userIds.length },
          'Batch banning users...',
        );

        const result = await service.banUsers(userIds);

        logger.info(
          { userIds, count: userIds.length },
          'Batch ban operation completed',
        );

        return c.json(result);
      } catch (error) {
        logger.error({ error, userIds }, 'Failed to batch ban users');

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Batch unban users
 */
export type BatchUnbanUsersRoute = ReturnType<
  typeof registerBatchUnbanUsersRoute
>;

/**
 * @name registerBatchUnbanUsersRoute
 * @description Register a route for unbanning multiple users
 * @param router - The router to register the route on
 */
function registerBatchUnbanUsersRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/unban/batch',
    zValidator(
      'json',
      z.object({
        userIds: z.array(z.string().uuid()).min(1).max(50),
      }),
    ),
    async (c) => {
      const service = createAdminUserService(c);
      const { userIds } = c.req.valid('json');
      const logger = await getLogger();

      try {
        logger.info(
          { userIds, count: userIds.length },
          'Batch unbanning users...',
        );

        const result = await service.unbanUsers(userIds);

        logger.info(
          { userIds, count: userIds.length },
          'Batch unban operation completed',
        );

        return c.json(result);
      } catch (error) {
        logger.error({ error, userIds }, 'Failed to batch unban users');

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Batch reset passwords
 */
export type BatchResetPasswordsRoute = ReturnType<
  typeof registerBatchResetPasswordsRoute
>;

/**
 * @name registerBatchResetPasswordsRoute
 * @description Register a route for resetting multiple users' passwords
 * @param router - The router to register the route on
 */
function registerBatchResetPasswordsRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/reset-password/batch',
    zValidator(
      'json',
      z.object({
        userIds: z.array(z.string().uuid()).min(1).max(50),
      }),
    ),
    async (c) => {
      const service = createAdminUserService(c);
      const { userIds } = c.req.valid('json');
      const logger = await getLogger();

      try {
        logger.info(
          { userIds, count: userIds.length },
          'Batch resetting passwords...',
        );

        const result = await service.resetPasswords(userIds);

        logger.info(
          { userIds, count: userIds.length },
          'Batch password reset operation completed',
        );

        return c.json(result);
      } catch (error) {
        logger.error({ error, userIds }, 'Failed to batch reset passwords');

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Batch delete users
 */
export type BatchDeleteUsersRoute = ReturnType<
  typeof registerBatchDeleteUsersRoute
>;

/**
 * @name registerBatchDeleteUsersRoute
 * @description Register a route for deleting multiple users
 * @param router - The router to register the route on
 */
function registerBatchDeleteUsersRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/delete/batch',
    zValidator(
      'json',
      z.object({
        userIds: z.array(z.string().uuid()).min(1).max(50),
      }),
    ),
    async (c) => {
      const service = createAdminUserService(c);
      const { userIds } = c.req.valid('json');
      const logger = await getLogger();

      try {
        logger.info(
          { userIds, count: userIds.length },
          'Batch deleting users...',
        );

        const result = await service.deleteUsers(userIds);

        logger.info(
          { userIds, count: userIds.length },
          'Batch delete operation completed',
        );

        return c.json(result);
      } catch (error) {
        logger.error({ error, userIds }, 'Failed to batch delete users');

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Send magic link
 */
export type SendMagicLinkRoute = ReturnType<typeof registerSendMagicLinkRoute>;

/**
 * @name registerSendMagicLinkRoute
 * @description Register a route for sending a magic link to a user
 * @param router - The router to register the route on
 */
function registerSendMagicLinkRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/:id/magic-link',
    zValidator('param', z.object({ id: z.string().uuid() })),
    zValidator(
      'json',
      z.object({
        type: z.enum(['signup', 'recovery', 'invite']).default('recovery'),
      }),
    ),
    async (c) => {
      const service = createAdminUserService(c);
      const { id } = c.req.valid('param');
      const { type } = c.req.valid('json');
      const logger = await getLogger();

      try {
        logger.info({ id, type }, 'Sending magic link...');

        const result = await service.sendMagicLink(id, type);

        logger.info({ id, type }, 'Magic link sent successfully');

        return c.json(result);
      } catch (error) {
        logger.error({ error, userId: id }, 'Failed to send magic link');

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Remove MFA factor
 */
export type RemoveMfaFactorRoute = ReturnType<
  typeof registerRemoveMfaFactorRoute
>;

/**
 * @name registerRemoveMfaFactorRoute
 * @description Register a route for removing an MFA factor from a user
 * @param router - The router to register the route on
 */
function registerRemoveMfaFactorRoute(router: Hono) {
  return router.delete(
    '/v1/admin/users/:id/mfa/:factorId',
    zValidator(
      'param',
      z.object({
        id: z.string().uuid(),
        factorId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const service = createAdminUserService(c);
      const { id, factorId } = c.req.valid('param');
      const logger = await getLogger();

      try {
        logger.info({ id, factorId }, 'Removing MFA factor...');

        const result = await service.removeMfaFactor(id, factorId);

        logger.info({ id, factorId }, 'MFA factor removed successfully');

        return c.json(result);
      } catch (error) {
        logger.error(
          { error, userId: id, factorId },
          'Failed to remove MFA factor',
        );

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Update admin access
 */
export type UpdateAdminAccessRoute = ReturnType<
  typeof registerUpdateAdminAccessRoute
>;

/**
 * @name registerUpdateAdminAccessRoute
 * @description Register a route for updating admin access status of a user
 * @param router - The router to register the route on
 */
function registerUpdateAdminAccessRoute(router: Hono) {
  return router.put(
    '/v1/admin/users/:id/admin-access',
    zValidator('param', z.object({ id: z.string().uuid() })),
    zValidator(
      'json',
      z.object({
        adminAccess: z.boolean(),
      }),
    ),
    async (c) => {
      const service = createAdminUserService(c);
      const { id } = c.req.valid('param');
      const { adminAccess } = c.req.valid('json');
      const logger = await getLogger();

      try {
        logger.info({ id, adminAccess }, 'Updating admin access...');

        const result = await service.updateAdminAccess(id, adminAccess);

        logger.info({ id, adminAccess }, 'Admin access updated successfully');

        return c.json(result);
      } catch (error) {
        logger.error(
          { error, userId: id, adminAccess },
          'Failed to update admin access',
        );

        return c.json({ error: getErrorMessage(error), success: false }, 500);
      }
    },
  );
}
