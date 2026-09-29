import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { createAuthorizationService } from '@pymekit/cms-auth/services';
import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { checkIsMfaEnabled } from '@pymekit/cms-supabase/check-requires-mfa';
import { getSupabaseClient } from '@pymekit/cms-supabase/hono';
import { getLogger } from '@pymekit/shared/logger';

import { createConfigurationService } from '../services/configuration.service';

const UpdateMfaConfigurationSchema = z.object({
  requiresMfa: z.boolean(),
});

export type MfaConfigurationRoute = ReturnType<
  typeof registerMfaConfigurationRouter
>;

/**
 * Register the MFA configuration router
 * @param router
 */
export function registerMfaConfigurationRouter(router: Hono) {
  return router
    .get('/v1/configuration/mfa', async (c) => {
      const logger = await getLogger();
      const client = getSupabaseClient(c);

      const configService = createConfigurationService(c);
      const authService = createAuthorizationService(c);

      try {
        const userHasMfaEnabledPromise = checkIsMfaEnabled(client);

        const requiresMfaConfigValuePromise =
          configService.getConfigurationValue('requires_mfa');

        const hasPermissionToUpdatePromise = authService.hasAdminPermission(
          'system_setting',
          'update',
        );

        const [
          userHasMFAEnabled,
          requiresMfaConfigValue,
          hasPermissionToUpdateMFA,
        ] = await Promise.all([
          userHasMfaEnabledPromise,
          requiresMfaConfigValuePromise,
          hasPermissionToUpdatePromise,
        ]);

        return c.json({
          success: true,
          data: {
            requiresMfa: requiresMfaConfigValue === 'true',
            hasPermissionToUpdateMFA,
            userHasMFAEnabled,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Error getting MFA configuration');

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    })
    .put(
      '/v1/configuration/mfa',
      zValidator('json', UpdateMfaConfigurationSchema),
      async (c) => {
        const logger = await getLogger();
        const configService = createConfigurationService(c);
        const client = getSupabaseClient(c);

        const { requiresMfa } = c.req.valid('json');

        logger.info({ requiresMfa }, 'Updating MFA configuration...');

        try {
          const userHasMfaEnabled = await checkIsMfaEnabled(client);

          if (!userHasMfaEnabled) {
            return c.json(
              {
                error: 'User does not have MFA enabled.',
              },
              403,
            );
          }

          // update the configuration
          const result =
            await configService.updateMfaConfiguration(requiresMfa);

          logger.info(
            { requiresMfa },
            'MFA configuration updated successfully',
          );

          return c.json({
            success: true,
            message: 'MFA configuration updated successfully',
            data: {
              key: result[0]!.key,
              value: result[0]!.value,
            },
          });
        } catch (error) {
          logger.error(
            { error, requiresMfa },
            'Error updating MFA configuration',
          );

          return c.json({ error: getErrorMessage(error) }, 500);
        }
      },
    );
}
