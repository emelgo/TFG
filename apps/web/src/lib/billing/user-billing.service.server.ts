import type { SupabaseClient } from '@supabase/supabase-js';

import type * as z from 'zod';

import { createAccountsApi } from '@pymekit/accounts/api';
import { getProductPlanPair } from '@pymekit/billing';
import { getBillingGatewayProvider } from '@pymekit/billing-gateway';
import { getLogger } from '@pymekit/shared/logger';
import type { Database } from '@pymekit/supabase/database';
import { requireUser } from '@pymekit/supabase/require-user';
import { getSupabaseServerAdminClient } from '@pymekit/supabase/server-admin-client';

import appConfig from '#/config/app.config.ts';
import billingConfig from '#/config/billing.config.ts';
import pathsConfig from '#/config/paths.config.ts';

import type { PersonalAccountCheckoutSchema } from './schema/personal-account-checkout.schema';

export function createUserBillingService(client: SupabaseClient<Database>) {
  return new UserBillingService(client);
}

/**
 * @name UserBillingService
 * @description Service for managing billing for personal accounts.
 */
class UserBillingService {
  private readonly namespace = 'billing.personal-account';

  constructor(private readonly client: SupabaseClient<Database>) {}

  /**
   * @name createCheckoutSession
   * @description Create a checkout session for the user.
   *
   * Returns the hosted-checkout `url` and/or the embedded `checkoutToken`. In
   * the Next.js version this method called `redirect(url)` to send the browser
   * to the provider's hosted page. TanStack's `redirect()` is router-only and
   * cannot target external URLs, so we instead return the url and let the
   * client navigate via `window.location.assign(url)`.
   * @param planId
   * @param productId
   */
  async createCheckoutSession({
    planId,
    productId,
  }: z.output<typeof PersonalAccountCheckoutSchema>) {
    // get the authenticated user
    const { data: user, error } = await requireUser(this.client);

    if (error ?? !user) {
      throw new Error('Authentication required');
    }

    const service = await getBillingGatewayProvider(this.client);

    // in the case of personal accounts
    // the account ID is the same as the user ID
    const accountId = user.id;

    // the return URL for the checkout session
    const returnUrl = getCheckoutSessionReturnUrl();

    // find the customer ID for the account if it exists
    // (eg. if the account has been billed before)
    const api = createAccountsApi(this.client);
    const customerId = await api.getCustomerId(accountId);

    const product = billingConfig.products.find(
      (item) => item.id === productId,
    );

    if (!product) {
      throw new Error('Product not found');
    }

    const { plan } = getProductPlanPair(billingConfig, planId);

    // Determine trial eligibility at the identity level: if the user already
    // has billing history on any account they own (personal or team), do not
    // grant another trial. This prevents farming free trials by creating
    // additional accounts. Uses the admin client to read across the user's own
    // accounts, scoped to the authenticated user id.
    const ownerHasBillingHistory = await createAccountsApi(
      getSupabaseServerAdminClient(),
    ).ownerHasBillingHistory(accountId);

    const checkoutPlan = ownerHasBillingHistory
      ? { ...plan, trialDays: undefined }
      : plan;

    const logger = await getLogger();

    logger.info(
      {
        name: `billing.personal-account`,
        planId,
        customerId,
        accountId,
      },
      `User requested a personal account checkout session. Contacting provider...`,
    );

    let checkoutToken: string | null | undefined;
    let url: string | null | undefined;

    try {
      // call the payment gateway to create the checkout session
      const checkout = await service.createCheckoutSession({
        returnUrl,
        accountId,
        customerEmail: user.email,
        customerId,
        plan: checkoutPlan,
        variantQuantities: [],
        enableDiscountField: product.enableDiscountField,
      });

      checkoutToken = checkout.checkoutToken;
      url = checkout.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : error;

      logger.error(
        {
          name: `billing.personal-account`,
          planId,
          customerId,
          accountId,
          error: message,
        },
        `Checkout session not created due to an error`,
      );

      throw new Error(`Failed to create a checkout session`, { cause: error });
    }

    if (!url && !checkoutToken) {
      throw new Error(
        'Checkout session returned neither a URL nor a checkout token',
      );
    }

    logger.info(
      {
        userId: user.id,
      },
      `Checkout session created. Returning result to client...`,
    );

    // Return the hosted-checkout url and/or the embedded checkout token. The
    // client navigates to `url` for hosted checkout, or renders the embedded
    // checkout with `checkoutToken`.
    return {
      url: url ?? null,
      checkoutToken: checkoutToken ?? null,
    };
  }

  /**
   * @name createBillingPortalSession
   * @description Create a billing portal session for the user
   * @returns The URL to redirect the user to the billing portal
   */
  async createBillingPortalSession() {
    const { data, error } = await requireUser(this.client);

    if (error ?? !data) {
      throw new Error('Authentication required');
    }

    const service = await getBillingGatewayProvider(this.client);
    const logger = await getLogger();

    const accountId = data.id;
    const api = createAccountsApi(this.client);
    const customerId = await api.getCustomerId(accountId);
    const returnUrl = getBillingPortalReturnUrl();

    if (!customerId) {
      throw new Error('Customer not found');
    }

    const ctx = {
      name: this.namespace,
      customerId,
      accountId,
    };

    logger.info(
      ctx,
      `User requested a Billing Portal session. Contacting provider...`,
    );

    let url: string;

    try {
      const session = await service.createBillingPortalSession({
        customerId,
        returnUrl,
      });

      url = session.url;
    } catch (error) {
      logger.error(
        {
          error,
          ...ctx,
        },
        `Failed to create a Billing Portal session`,
      );

      throw new Error(
        `Encountered an error creating the Billing Portal session`,
        { cause: error },
      );
    }

    logger.info(ctx, `Session successfully created.`);

    // return the billing portal url — the action wraps it as `{ url }` and the
    // client navigates via `window.location.assign(url)`.
    return url;
  }
}

function getCheckoutSessionReturnUrl() {
  return new URL(
    pathsConfig.app.settingsBillingReturn,
    appConfig.url,
  ).toString();
}

function getBillingPortalReturnUrl() {
  return new URL(pathsConfig.app.settingsBilling, appConfig.url).toString();
}
