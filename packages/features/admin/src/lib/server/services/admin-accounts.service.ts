import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@pymekit/supabase/database';

export function createAdminAccountsService(
  adminClient: SupabaseClient<Database>,
  client: SupabaseClient<Database>,
) {
  return new AdminAccountsService(adminClient, client);
}

class AdminAccountsService {
  constructor(
    private adminClient: SupabaseClient<Database>,
    private client: SupabaseClient<Database>,
  ) {}

  async deleteAccount(accountId: string) {
    await this.assertAccountOwnerIsNotProtected(accountId);

    const { error } = await this.adminClient
      .from('accounts')
      .delete()
      .eq('id', accountId);

    if (error) {
      throw error;
    }
  }

  /**
   * Assert that the account being deleted is not owned by the current Super
   * Admin (self-protection) nor by another Super Admin (peer-protection),
   * mirroring the guard applied to user-targeting admin actions. Fails closed
   * on any lookup error.
   * @param accountId
   */
  private async assertAccountOwnerIsNotProtected(accountId: string) {
    const { data: user } = await this.client.auth.getUser();
    const currentUserId = user.user?.id;

    if (!currentUserId) {
      throw new Error(`Error fetching user`);
    }

    const { data: account, error: accountError } = await this.adminClient
      .from('accounts')
      .select('primary_owner_user_id, is_personal_account')
      .eq('id', accountId)
      .maybeSingle();

    // Fail closed on a real lookup error.
    if (accountError) {
      throw new Error(`Error fetching account`);
    }

    // If the account does not exist, do not block: the subsequent delete is a
    // no-op (zero rows), preserving the prior behaviour for unknown ids.
    if (!account) {
      return;
    }

    // Only personal accounts represent a Super Admin identity worth protecting.
    // Team accounts are workspaces an admin may legitimately delete, so leave
    // that path unrestricted to avoid a behavioural regression.
    if (!account.is_personal_account) {
      return;
    }

    const ownerId = account.primary_owner_user_id;

    if (ownerId === currentUserId) {
      throw new Error(`You cannot delete your own account as a Super Admin`);
    }

    const ownerUser = await this.adminClient.auth.admin.getUserById(ownerId);

    if (ownerUser.error) {
      throw new Error(`Error fetching account owner`);
    }

    const ownerRole = ownerUser.data.user?.app_metadata?.role;

    if (ownerRole === 'super-admin') {
      throw new Error(`You cannot delete a Super Admin account`);
    }
  }
}
