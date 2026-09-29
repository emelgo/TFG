import { Hono } from 'hono';

import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { createAccountService } from '../services/account.service';

/**
 * Register the get account preferences route
 * @param router - The router
 * @returns The router
 */
export function registerGetAccountRoute(router: Hono) {
  return router.get('/v1/account', async (c) => {
    const logger = await getLogger();
    const service = createAccountService(c);

    try {
      const account = await service.getAccount();

      if (!account) {
        return c.json(
          {
            error: 'Account not found',
          },
          404,
        );
      }

      return c.json({ account });
    } catch (error) {
      logger.error(
        {
          error,
        },
        'Error getting account',
      );

      return c.json(
        {
          error: getErrorMessage(error),
        },
        500,
      );
    }
  });
}

export type GetAccountRoute = ReturnType<typeof registerGetAccountRoute>;
