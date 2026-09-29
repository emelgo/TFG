import type { Stripe } from 'stripe';
import * as z from 'zod';

import type { CreateBillingPortalSessionSchema } from '@pymekit/billing/schema';

/**
 * @name createStripeBillingPortalSession
 * @description Create a Stripe billing portal session for a user
 */
export async function createStripeBillingPortalSession(
  stripe: Stripe,
  params: z.output<typeof CreateBillingPortalSessionSchema>,
) {
  return stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
}
