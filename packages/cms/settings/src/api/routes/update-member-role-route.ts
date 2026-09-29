import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { createMembersService } from '../services/members.service';
import { UpdateMemberRoleSchema } from './types';

/**
 * Register the update member role route
 */
export function registerUpdateMemberRoleRouter(router: Hono) {
  return router.put(
    '/v1/members/role',
    zValidator('json', UpdateMemberRoleSchema),
    async (c) => {
      const logger = await getLogger();
      const { accountId, roleId } = c.req.valid('json');
      const service = createMembersService(c);

      logger.info(
        {
          accountId,
          roleId,
        },
        'Updating member role...',
      );

      try {
        // Update the member role
        const result = await service.updateMemberRole({
          accountId,
          roleId,
        });

        logger.info(
          {
            accountId,
            roleId,
          },
          'Member role updated',
        );

        return c.json({
          success: true,
          data: result,
          error: null,
        });
      } catch (error) {
        logger.error(
          {
            accountId,
            roleId,
            error,
          },
          'Error updating member role',
        );

        return c.json(
          {
            success: false,
            data: null,
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

export type UpdateMemberRoleRoute = ReturnType<
  typeof registerUpdateMemberRoleRouter
>;
