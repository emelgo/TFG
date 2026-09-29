import { getLogger } from '@pymekit/shared/logger';
import { getSupabaseServerAdminClient } from '@pymekit/supabase/server-admin-client';

export function createCreateTeamAccountService() {
  return new CreateTeamAccountService();
}

class CreateTeamAccountService {
  private readonly namespace = 'accounts.create-team-account';

  async createNewOrganizationAccount(params: {
    name: string;
    userId: string;
    slug?: string;
  }) {
    const client = getSupabaseServerAdminClient();
    const logger = await getLogger();
    const ctx = { ...params, namespace: this.namespace };

    logger.info(ctx, `Creating new team account...`);

    // Call the RPC function which handles:
    // 1. Checking if team accounts are enabled
    // 2. Creating the account with name, slug, and primary_owner_user_id
    // 3. Creating membership for the owner (atomic transaction)
    const { error, data } = await client.rpc('create_team_account', {
      account_name: params.name,
      user_id: params.userId,
      account_slug: params.slug,
    });

    if (error) {
      // Handle duplicate slug error
      if (error.code === '23505' && error.message.includes('slug')) {
        logger.warn(
          { ...ctx, slug: params.slug },
          `Duplicate slug detected, rejecting team creation`,
        );

        return {
          data: null,
          error: 'duplicate_slug' as const,
        };
      }

      logger.error({ error, ...ctx }, `Error creating team account`);

      throw new Error('Error creating team account');
    }

    logger.info(ctx, `Team account created successfully`);

    return { data, error: null };
  }
}
