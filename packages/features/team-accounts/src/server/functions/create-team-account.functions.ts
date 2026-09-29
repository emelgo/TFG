import { createServerFn } from '@tanstack/react-start';

import { authFunctionMiddleware } from '@pymekit/function-middleware/functions';
import { getLogger } from '@pymekit/shared/logger';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

import { CreateTeamSchema } from '../../schema/create-team.schema';
import { createAccountCreationPolicyEvaluator } from '../policies';
import { createCreateTeamAccountService } from '../services/create-team-account.service.server';

export const createTeamAccountFunction = createServerFn({ method: 'POST' })
  .middleware(authFunctionMiddleware)
  .validator(CreateTeamSchema)
  .handler(async ({ data: { name, slug }, context: { user } }) => {
    const logger = await getLogger();
    const service = createCreateTeamAccountService();

    const ctx = {
      name: 'team-accounts.create',
      userId: user.id,
      accountName: name,
    };

    logger.info(ctx, `Creating team account...`);

    // Check policies before creating
    const evaluator = createAccountCreationPolicyEvaluator();

    if (await evaluator.hasPoliciesForStage('submission')) {
      const policyContext = {
        timestamp: new Date().toISOString(),
        userId: user.id,
        accountName: name,
      };

      const result = await evaluator.canCreateAccount(
        policyContext,
        'submission',
      );

      if (!result.allowed) {
        logger.warn(
          { ...ctx, reasons: result.reasons },
          `Policy denied team account creation`,
        );

        return {
          error: true,
          message: result.reasons[0] ?? 'Policy denied account creation',
        };
      }
    }

    const { data: account, error } = await service.createNewOrganizationAccount(
      {
        name,
        userId: user.id,
        slug,
      },
    );

    if (error === 'duplicate_slug') {
      return {
        error: true,
        message: 'teams.duplicateSlugError',
      };
    }

    logger.info(ctx, `Team account created`);

    // Make the new team the active account so the dashboard opens in it. A
    // failure here is non-fatal (the account exists); log it and let the
    // dashboard resolve the active account normally.
    const client = getSupabaseServerClient();

    const { error: activationError } = await client.rpc('set_active_account', {
      target_account_id: account.id,
    });

    if (activationError) {
      logger.error(
        { ...ctx, error: activationError },
        `Team account created but activating it as the active account failed`,
      );
    }

    // Navigation is handled client-side (see CreateTeamAccountForm): the dialog
    // that hosts this form lives in the persistent dashboard sidebar, so a
    // server redirect to '/dashboard' would be a same-route no-op and leave the
    // dialog open. Returning success lets the client close the dialog and
    // invalidate/navigate so the new active account is picked up.
    return { success: true as const };
  });
