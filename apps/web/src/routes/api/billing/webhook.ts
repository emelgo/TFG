import { createFileRoute } from '@tanstack/react-router';

import { getPlanTypesMap } from '@pymekit/billing';
import { getBillingEventHandlerService } from '@pymekit/billing-gateway';
import { getLogger } from '@pymekit/shared/logger';
import { getSupabaseServerAdminClient } from '@pymekit/supabase/server-admin-client';

import billingConfig from '#/config/billing.config.ts';

/**
 * @description Handle the webhooks from the billing provider (Stripe / Lemon Squeezy).
 *
 * The webhook service verifies the request signature internally against the raw
 * request body (Stripe's `constructEventAsync` needs the untouched payload), so
 * the raw `Request` is passed straight through without parsing.
 */
export const Route = createFileRoute('/api/billing/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provider = billingConfig.provider;
        const logger = await getLogger();

        const ctx = {
          name: 'billing.webhook',
          provider,
        };

        logger.info(ctx, `Received billing webhook. Processing...`);

        const supabaseClientProvider = () => getSupabaseServerAdminClient();

        const service = await getBillingEventHandlerService(
          supabaseClientProvider,
          provider,
          getPlanTypesMap(billingConfig),
        );

        try {
          await service.handleWebhookEvent(request);

          logger.info(ctx, `Successfully processed billing webhook`);

          return new Response('OK', { status: 200 });
        } catch (error) {
          logger.error({ ...ctx, error }, `Failed to process billing webhook`);

          return new Response('Failed to process billing webhook', {
            status: 500,
          });
        }
      },
    },
  },
});
