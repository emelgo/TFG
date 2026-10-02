import type { SupabaseClient } from '@supabase/supabase-js';

import { getLogger } from '@pymekit/shared/logger';
import type { Database } from '@pymekit/supabase/database';

export function createAdminDashboardService(client: SupabaseClient<Database>) {
  return new AdminDashboardService(client);
}

export class AdminDashboardService {
  constructor(private readonly client: SupabaseClient<Database>) {}

  /**
   * Get the dashboard data for the admin dashboard
   * @param count
   */
  async getDashboardData(
    { count }: { count: 'exact' | 'estimated' | 'planned' } = {
      count: 'estimated',
    },
  ) {
    const logger = await getLogger();
    const ctx = {
      name: `admin.dashboard`,
    };

    const selectParams = {
      count,
      head: true,
    };

    const subscriptionsPromise = this.client
      .from('subscriptions')
      .select('*', selectParams)
      .eq('status', 'active')
      .then((response) => {
        if (response.error) {
          logger.error(
            { ...ctx, error: response.error },
            `Error fetching active subscriptions`,
          );

          // Mensaje no vacío: antes se lanzaba `new Error()` y la página fallaba
          // con un error en blanco, imposible de diagnosticar (F3b). El detalle
          // de PostgREST queda en el log; al cliente solo llega este resumen.
          throw new Error(`Error fetching active subscriptions`);
        }

        return response.count;
      });

    const trialsPromise = this.client
      .from('subscriptions')
      .select('*', selectParams)
      .eq('status', 'trialing')
      .then((response) => {
        if (response.error) {
          logger.error(
            { ...ctx, error: response.error },
            `Error fetching trialing subscriptions`,
          );

          throw new Error(`Error fetching trialing subscriptions`);
        }

        return response.count;
      });

    const accountsPromise = this.client
      .from('accounts')
      .select('*', selectParams)
      .eq('is_personal_account', true)
      .then((response) => {
        if (response.error) {
          logger.error(
            { ...ctx, error: response.error },
            `Error fetching personal accounts`,
          );

          throw new Error(`Error fetching personal accounts`);
        }

        return response.count;
      });

    const teamAccountsPromise = this.client
      .from('accounts')
      .select('*', selectParams)
      .eq('is_personal_account', false)
      .then((response) => {
        if (response.error) {
          logger.error(
            { ...ctx, error: response.error },
            `Error fetching team accounts`,
          );

          throw new Error(`Error fetching team accounts`);
        }

        return response.count;
      });

    const [subscriptions, trials, accounts, teamAccounts] = await Promise.all([
      subscriptionsPromise,
      trialsPromise,
      accountsPromise,
      teamAccountsPromise,
    ]);

    return {
      subscriptions,
      trials,
      accounts,
      teamAccounts,
    };
  }
}
