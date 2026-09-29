import type Stripe from 'stripe';

import type { UpsertSubscriptionParams } from '@pymekit/billing/types';

type SubscriptionStatus = UpsertSubscriptionParams['status'];

/**
 * The subscription statuses supported by the database enum. Stripe types its
 * status unions as open-ended strings, so incoming values must be narrowed
 * before they can be persisted.
 */
const SUBSCRIPTION_STATUSES: Record<SubscriptionStatus, true> = {
  active: true,
  canceled: true,
  incomplete: true,
  incomplete_expired: true,
  past_due: true,
  paused: true,
  trialing: true,
  unpaid: true,
};

function toSubscriptionStatus(status: string) {
  if (!Object.hasOwn(SUBSCRIPTION_STATUSES, status)) {
    throw new Error(`Unsupported Stripe subscription status: ${status}`);
  }

  return status as SubscriptionStatus;
}

/**
 * @name createStripeSubscriptionPayloadBuilderService
 * @description Create a new instance of the `StripeSubscriptionPayloadBuilderService` class
 */
export function createStripeSubscriptionPayloadBuilderService() {
  return new StripeSubscriptionPayloadBuilderService();
}

/**
 * @name StripeSubscriptionPayloadBuilderService
 * @description This class is used to build the subscription payload for Stripe
 */
class StripeSubscriptionPayloadBuilderService {
  /**
   * @name build
   * @description Build the subscription payload for Stripe
   * @param params
   */
  build<
    LineItem extends {
      id: string;
      quantity?: number;
      price?: Stripe.Price;
      type: 'flat' | 'per_seat' | 'metered';
    },
  >(params: {
    id: string;
    accountId: string;
    customerId: string;
    lineItems: LineItem[];
    status: Stripe.Subscription.Status;
    currency: string;
    cancelAtPeriodEnd: boolean;
    periodStartsAt: number;
    periodEndsAt: number;
    trialStartsAt: number | null;
    trialEndsAt: number | null;
  }): UpsertSubscriptionParams {
    const status = toSubscriptionStatus(params.status);
    const active = status === 'active' || status === 'trialing';

    const lineItems = params.lineItems.map((item) => {
      const quantity = item.quantity ?? 1;
      const variantId = item.price?.id as string;

      return {
        id: item.id,
        quantity,
        subscription_id: params.id,
        subscription_item_id: item.id,
        product_id: item.price?.product as string,
        variant_id: variantId,
        price_amount: item.price?.unit_amount,
        interval: item.price?.recurring?.interval as string,
        interval_count: item.price?.recurring?.interval_count as number,
        type: item.type,
      };
    });

    // otherwise we are updating a subscription
    // and we only need to return the update payload
    return {
      target_subscription_id: params.id,
      target_account_id: params.accountId,
      target_customer_id: params.customerId,
      billing_provider: 'stripe',
      status,
      line_items: lineItems,
      active,
      currency: params.currency,
      cancel_at_period_end: params.cancelAtPeriodEnd ?? false,
      period_starts_at: getISOString(params.periodStartsAt) as string,
      period_ends_at: getISOString(params.periodEndsAt) as string,
      trial_starts_at: getISOString(params.trialStartsAt),
      trial_ends_at: getISOString(params.trialEndsAt),
    };
  }

  /**
   * @name getPeriodStartsAt
   * @description Get the period starts at for the subscription
   * @param subscription
   */
  getPeriodStartsAt(subscription: Stripe.Subscription) {
    // for retro-compatibility, we need to check if the subscription has a period

    // if it does, we use the period start, otherwise we use the subscription start
    // (Stripe 17 and below)
    if ('current_period_start' in subscription) {
      return subscription.current_period_start as number;
    }

    // if it doesn't, we use the subscription item start (Stripe 18+)
    return subscription.items.data[0]!.current_period_start;
  }

  /**
   * @name getPeriodEndsAt
   * @description Get the period ends at for the subscription
   * @param subscription
   */
  getPeriodEndsAt(subscription: Stripe.Subscription) {
    // for retro-compatibility, we need to check if the subscription has a period

    // if it does, we use the period end, otherwise we use the subscription end
    // (Stripe 17 and below)
    if ('current_period_end' in subscription) {
      return subscription.current_period_end as number;
    }

    // if it doesn't, we use the subscription item end (Stripe 18+)
    return subscription.items.data[0]!.current_period_end;
  }

  /**
   * @name getCancelAtPeriodEnd
   * @description Determine whether the subscription is scheduled for
   * cancellation. In Stripe's flexible billing mode (default for API
   * versions 2025-09-30.clover and later), portal-initiated cancellations
   * may set `cancel_at` to a future timestamp while leaving
   * `cancel_at_period_end` as `false`. Treat either signal as cancellation.
   */
  getCancelAtPeriodEnd(subscription: Stripe.Subscription) {
    if (subscription.cancel_at_period_end) {
      return true;
    }

    if (subscription.cancel_at === null) {
      return false;
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);

    return subscription.cancel_at > nowInSeconds;
  }
}

function getISOString(date: number | null) {
  return date ? new Date(date * 1000).toISOString() : undefined;
}
