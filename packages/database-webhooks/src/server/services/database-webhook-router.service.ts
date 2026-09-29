import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@pymekit/supabase/database';

import type { RecordChange, Tables } from '../record-change.type';

export function createDatabaseWebhookRouterService(
  adminClient: SupabaseClient<Database>,
) {
  return new DatabaseWebhookRouterService(adminClient);
}

/**
 * @name DatabaseWebhookRouterService
 * @description Service that routes the webhook event to the appropriate service
 */
class DatabaseWebhookRouterService {
  // The admin client is accepted for API parity but not currently used: the
  // subscription handler resolves its own billing service on demand.
  constructor(_adminClient: SupabaseClient<Database>) {}

  /**
   * @name handleWebhook
   * @description Handle the webhook event
   * @param body
   */
  async handleWebhook(body: RecordChange<keyof Tables>) {
    switch (body.table) {
      case 'subscriptions': {
        const payload = body as RecordChange<typeof body.table>;

        return this.handleSubscriptionsWebhook(payload);
      }
    }
  }

  private async handleSubscriptionsWebhook(
    body: RecordChange<'subscriptions'>,
  ) {
    if (body.type === 'DELETE' && body.old_record) {
      const { createBillingWebhooksService } =
        await import('@pymekit/billing-gateway');

      const service = createBillingWebhooksService();

      return service.handleSubscriptionDeletedWebhook(body.old_record);
    }
  }
}
