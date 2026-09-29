import * as z from 'zod';

import {
  type BillingProviderSchema,
  BillingWebhookHandlerService,
  type PlanTypeMap,
} from '@pymekit/billing';
import { createRegistry } from '@pymekit/shared/registry';

/**
 * @description Creates a registry for billing webhook handlers
 * @param planTypesMap - A map of plan types as setup by the user in the billing config
 * @returns The billing webhook handler registry
 */
export function createBillingEventHandlerFactoryService(
  planTypesMap: PlanTypeMap,
) {
  // Create a registry for billing webhook handlers
  const billingWebhookHandlerRegistry = createRegistry<
    BillingWebhookHandlerService,
    z.output<typeof BillingProviderSchema>
  >();

  // Register the Stripe webhook handler
  billingWebhookHandlerRegistry.register('stripe', async () => {
    const { StripeWebhookHandlerService } = await import('@pymekit/stripe');

    return new StripeWebhookHandlerService(planTypesMap);
  });

  return billingWebhookHandlerRegistry;
}
