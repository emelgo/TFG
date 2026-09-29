import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { createMembersService } from '../services/members.service';

/**
 * Update a member's account
 * @param router - The Hono router
 * @returns The Hono route
 */
export function registerUpdateAccountRouter(router: Hono) {
  return router.put(
    '/v1/members/:id',
    zValidator(
      'json',
      z.object({
        displayName: z.string().max(500),
        email: z.string().email(),
      }),
    ),
    async (c) => {
      const logger = await getLogger();
      const { id } = c.req.param();
      const { displayName, email } = c.req.valid('json');
      const membersService = createMembersService(c);

      logger.info(
        {
          id,
          displayName,
          email,
        },
        'Updating account...',
      );

      try {
        await membersService.updateAccount(id, {
          displayName,
          email,
        });

        logger.info(
          {
            id,
            displayName,
            email,
          },
          'Account updated',
        );

        return c.json({
          message: 'Account updated',
          success: true,
        });
      } catch (error) {
        logger.error(
          {
            id,
            displayName,
            email,
            error,
          },
          'Error updating account',
        );

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

export type UpdateAccountRoute = ReturnType<typeof registerUpdateAccountRouter>;
