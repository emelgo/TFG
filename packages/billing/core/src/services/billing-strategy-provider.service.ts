import * as z from 'zod';

import {
  CancelSubscriptionParamsSchema,
  CreateBillingCheckoutSchema,
  CreateBillingPortalSessionSchema,
  QueryBillingUsageSchema,
  ReportBillingUsageSchema,
  RetrieveCheckoutSessionSchema,
  UpdateSubscriptionParamsSchema,
} from '../schema';
import type { UpsertSubscriptionParams } from '../types';

export abstract class BillingStrategyProviderService {
  abstract createBillingPortalSession(
    params: z.output<typeof CreateBillingPortalSessionSchema>,
  ): Promise<{
    url: string;
  }>;

  abstract retrieveCheckoutSession(
    params: z.output<typeof RetrieveCheckoutSessionSchema>,
  ): Promise<{
    checkoutToken: string | null;
    status: 'complete' | 'expired' | 'open';
    isSessionOpen: boolean;

    customer: {
      email: string | null;
    };
  }>;

  abstract createCheckoutSession(
    params: z.output<typeof CreateBillingCheckoutSchema>,
  ): Promise<{
    checkoutToken: string | null;
    url?: string | null;
  }>;

  abstract cancelSubscription(
    params: z.output<typeof CancelSubscriptionParamsSchema>,
  ): Promise<{
    success: boolean;
  }>;

  abstract reportUsage(
    params: z.output<typeof ReportBillingUsageSchema>,
  ): Promise<{
    success: boolean;
  }>;

  abstract queryUsage(
    params: z.output<typeof QueryBillingUsageSchema>,
  ): Promise<{
    value: number;
  }>;

  abstract updateSubscriptionItem(
    params: z.output<typeof UpdateSubscriptionParamsSchema>,
  ): Promise<{
    success: boolean;
  }>;

  abstract getPlanById(planId: string): Promise<{
    id: string;
    name: string;
    description?: string;
    interval: string;
    amount: number;
    type: 'recurring' | 'one_time';
    intervalCount?: number;
  }>;

  abstract getSubscription(subscriptionId: string): Promise<
    UpsertSubscriptionParams & {
      // we can't always guarantee that the target account id will be present
      // so we need to make it optional and let the consumer handle it
      target_account_id: string | undefined;
    }
  >;
}
