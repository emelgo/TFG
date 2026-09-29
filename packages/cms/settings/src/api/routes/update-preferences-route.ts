import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { createAccountService } from '../services/account.service';

/**
 * Register the update preferences route
 * @param router
 * @returns
 */
export function registerUpdatePreferencesRouter(router: Hono) {
  return router.post(
    '/v1/account/preferences',
    zValidator(
      'json',
      z.object({
        language: z.string().optional(),
        timezone: z.string().optional(),
      }),
    ),
    async (c) => {
      const logger = await getLogger();
      const { language, timezone } = c.req.valid('json');

      const service = createAccountService(c);

      try {
        const data = await service.updatePreferences({ language, timezone });

        logger.info(data, 'Preferences updated');

        return c.json({ success: true, data: { language, timezone } });
      } catch (error) {
        logger.error(
          { language, timezone, error },
          'Error updating preferences',
        );

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

export type UpdatePreferencesRoute = ReturnType<
  typeof registerUpdatePreferencesRouter
>;
