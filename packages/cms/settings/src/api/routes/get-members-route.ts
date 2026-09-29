import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { createAuthorizationService } from '@pymekit/cms-auth/services';
import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getSupabaseClient } from '@pymekit/cms-supabase/hono';
import { getLogger } from '@pymekit/shared/logger';

import { createMembersService } from '../services/members.service';

/**
 * Register the members management routes
 */
export function registerGetMembersRouter(router: Hono) {
  return router.get(
    '/v1/members',
    zValidator(
      'query',
      z.object({
        page: z.coerce.number().min(1).default(1),
        search: z.string().optional(),
      }),
    ),
    async (c) => {
      const service = createMembersService(c);
      const logger = await getLogger();
      const { page, search } = c.req.valid('query');

      try {
        // Get the members with pagination info
        const result = await service.getMembers({
          page,
          search,
          limit: 10,
        });

        return c.json({
          members: result.data,
          pageSize: result.pageSize,
          pageIndex: result.pageIndex,
          pageCount: result.pageCount,
          total: result.total,
        });
      } catch (error) {
        logger.error(
          {
            error,
          },
          'Error fetching members',
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
 * Register the member details route
 * @param router - The router to register the route on
 * @returns The router with the member details route registered
 */
export function registerGetMemberDetailsRouter(router: Hono) {
  return router.get(
    '/v1/members/:id',
    zValidator('param', z.object({ id: z.string().uuid() })),
    async (c) => {
      const service = createMembersService(c);
      const authorizationService = createAuthorizationService(c);

      const accountId = c.req.param('id');

      try {
        const [data, access] = await Promise.all([
          service.getMemberDetails(accountId),
          authorizationService.canActionAccount(accountId, 'update'),
        ]);

        return c.json({
          ...data,
          access: {
            canActionAccount: access,
          },
        });
      } catch (error) {
        const logger = await getLogger();

        logger.error(
          {
            accountId,
            error,
          },
          'Error fetching member details',
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
 * Register the route for updating member roles
 * @param router - The router to register the route on
 * @returns The router with the member roles update route registered
 */
export function registerUpdateMemberRolesRouter(router: Hono) {
  return router.post(
    '/v1/members/:id/roles',
    zValidator('param', z.object({ id: z.string().uuid() })),
    zValidator(
      'json',
      z.object({
        rolesToAdd: z.array(z.string()),
        rolesToRemove: z.array(z.string()),
      }),
    ),
    async (c) => {
      const memberId = c.req.param('id');
      const { rolesToAdd, rolesToRemove } = await c.req.json();
      const service = createMembersService(c);
      const logger = await getLogger();

      // Get the current user from auth
      const supabase = getSupabaseClient(c);

      logger.info(
        {
          memberId,
          rolesToAdd,
          rolesToRemove,
        },
        'Updating member roles...',
      );

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          return c.json(
            {
              error: 'Unauthorized: User not found',
              success: false,
            },
            401,
          );
        }

        // Get the current user's account ID
        const account = await service.getAccountByAuthId(user.id);

        if (!account) {
          return c.json(
            {
              error: 'User account not found',
              success: false,
            },
            404,
          );
        }

        // Check if user is trying to edit their own roles
        if (account.id === memberId) {
          return c.json(
            {
              error: 'You cannot modify your own roles',
              success: false,
            },
            403,
          );
        }

        await service.updateMemberRoles(memberId, {
          rolesToAdd,
          rolesToRemove,
        });

        logger.info(
          {
            memberId,
            rolesToAdd,
            rolesToRemove,
          },
          'Member roles updated successfully',
        );

        // Return updated member details
        const updatedMember = await service.getMemberDetails(memberId);

        return c.json({
          success: true,
          ...updatedMember,
        });
      } catch (error) {
        logger.error(
          {
            memberId,
            rolesToAdd,
            rolesToRemove,
            error,
          },
          'Error updating member roles',
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
 * Register the route for deactivating a member
 * @param router - The router to register the route on
 * @returns The router with the member deactivation route registered
 */
export function registerDeactivateMemberRouter(router: Hono) {
  return router.post(
    '/v1/members/:id/deactivate',
    zValidator('param', z.object({ id: z.string().uuid() })),
    async (c) => {
      const service = createMembersService(c);
      const memberId = c.req.param('id');
      const logger = await getLogger();

      logger.info(
        {
          memberId,
        },
        'Deactivating member...',
      );

      try {
        await service.deactivateMember(memberId);

        logger.info(
          {
            memberId,
          },
          'Member deactivated successfully',
        );

        return c.json({
          success: true,
        });
      } catch (error) {
        logger.error(
          {
            memberId,
            error,
          },
          'Error deactivating member',
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
 * Register the route for activating a member
 * @param router - The router to register the route on
 * @returns The router with the member activation route registered
 */
export function registerActivateMemberRouter(router: Hono) {
  return router.post(
    '/v1/members/:id/activate',
    zValidator('param', z.object({ id: z.string().uuid() })),
    async (c) => {
      const service = createMembersService(c);
      const memberId = c.req.param('id');
      const logger = await getLogger();

      try {
        logger.info(
          {
            memberId,
          },
          'Activating member...',
        );

        await service.activateMember(memberId);

        logger.info(
          {
            memberId,
          },
          'Member activated successfully',
        );

        return c.json({
          success: true,
        });
      } catch (error) {
        logger.error(
          {
            memberId,
            error,
          },
          'Error activating member',
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

export type GetMembersRoute = ReturnType<typeof registerGetMembersRouter>;

export type GetMemberDetailsRoute = ReturnType<
  typeof registerGetMemberDetailsRouter
>;

export type UpdateMemberRolesRoute = ReturnType<
  typeof registerUpdateMemberRolesRouter
>;

export type DeactivateMemberRoute = ReturnType<
  typeof registerDeactivateMemberRouter
>;

export type ActivateMemberRoute = ReturnType<
  typeof registerActivateMemberRouter
>;
