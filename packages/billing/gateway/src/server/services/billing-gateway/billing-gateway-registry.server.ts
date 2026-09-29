import * as z from 'zod';

import type {
  BillingProviderSchema,
  BillingStrategyProviderService,
} from '@pymekit/billing';
import { createRegistry } from '@pymekit/shared/registry';

// Create a registry for billing strategy providers
export const billingStrategyRegistry = createRegistry<
  BillingStrategyProviderService,
  z.output<typeof BillingProviderSchema>
>();

// Register the Stripe billing strategy
billingStrategyRegistry.register('stripe', async () => {
  const { StripeBillingStrategyService } = await import('@pymekit/stripe');
  return new StripeBillingStrategyService();
});
