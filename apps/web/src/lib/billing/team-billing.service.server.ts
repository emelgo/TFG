import type { SupabaseClient } from '@supabase/supabase-js';

import type * as z from 'zod';

import { createAccountsApi } from '@pymekit/accounts/api';
import type { LineItemSchema } from '@pymekit/billing';
import { getBillingGatewayProvider } from '@pymekit/billing-gateway';
import { getLogger } from '@pymekit/shared/logger';
import type { Database } from '@pymekit/supabase/database';
import { requireUser } from '@pymekit/supabase/require-user';
import { getSupabaseServerAdminClient } from '@pymekit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';
import { createTeamAccountsApi } from '@pymekit/team-accounts/api';

import appConfig from '#/config/app.config.ts';
import billingConfig from '#/config/billing.config.ts';
import pathsConfig from '#/config/paths.config.ts';

import type { TeamCheckoutSchema } from './schema/team-billing.schema';

export function createTeamBillingService(client: SupabaseClient<Database>) {
  return new TeamBillingService(client);
}

/**
 * @name TeamBillingService
 * @description Service for managing billing for team accounts.
 */
class TeamBillingService {
  private readonly namespace = 'billing.team-account';

  constructor(private readonly client: SupabaseClient<Database>) {}

  /**
   * @name createCheckout
   * @description Creates a checkout session for a Team account.
   *
   * Returns the hosted-checkout `url` and/or the embedded `checkoutToken`. The
   * Next.js version called `redirect(url)` for the hosted page; TanStack's
   * `redirect()` cannot target external URLs, so we return the url and let the
   * client navigate via `window.location.assign(url)`.
   */
  async createCheckout(params: z.output<typeof TeamCheckoutSchema>) {
    // we require the user to be authenticated
    const { data: user } = await requireUser(this.client);

    if (!user) {
      throw new Error('Authentication required');
    }

    const userId = user.id;
    const accountId = params.accountId;
    const logger = await getLogger();

    const ctx = {
      userId,
      accountId,
      name: this.namespace,
    };

    logger.info(ctx, `Requested checkout session. Processing...`);

    const api = createTeamAccountsApi(this.client);

    // verify permissions to manage billing
    const hasPermission = await api.hasPermission({
      userId,
      accountId,
      permission: 'billing.manage',
    });

    // if the user does not have permission to manage billing for the account
    // then we should not proceed
    if (!hasPermission) {
      logger.warn(
        ctx,
        `User without permissions attempted to create checkout.`,
      );

      throw new Error('Permission denied');
    }

    // here we have confirmed that the user has permission to manage billing for the account
    // so we go on and create a checkout session
    const service = await getBillingGatewayProvider(this.client);

    // retrieve the plan from the configuration
    // so we can assign the correct checkout data
    const { plan, product } = getPlanDetails(params.productId, params.planId);

    // Determine trial eligibility at the identity level: if the user already
    // has billing history on any account they own, do not grant another trial.
    // This prevents farming free trials by creating additional accounts (the
    // per-account customer-id check below only suppresses trials on accounts
    // that have been billed before). Uses the admin client to read across the
    // user's own accounts, scoped to the authenticated user id after the
    // billing.manage permission check above.
    const ownerHasBillingHistory = await createAccountsApi(
      getSupabaseServerAdminClient(),
    ).ownerHasBillingHistory(userId);

    const checkoutPlan = ownerHasBillingHistory
      ? { ...plan, trialDays: undefined }
      : plan;

    // find the customer ID for the account if it exists
    // (eg. if the account has been billed before)
    const customerId = await api.getCustomerId(accountId);
    const customerEmail = user.email;

    // the return URL for the checkout session
    const returnUrl = getCheckoutSessionReturnUrl(params.slug);

    // get variant quantities
    // useful for setting an initial quantity value for certain line items
    // such as per seat
    const variantQuantities = await this.getVariantQuantities(
      plan.lineItems,
      accountId,
    );

    logger.info(
      {
        ...ctx,
        planId: plan.id,
      },
      `Creating checkout session...`,
    );

    let checkoutToken: string | null | undefined;
    let url: string | null | undefined;

    try {
      // call the payment gateway to create the checkout session
      const checkout = await service.createCheckoutSession({
        accountId,
        plan: checkoutPlan,
        returnUrl,
        customerEmail,
        customerId,
        variantQuantities,
        enableDiscountField: product.enableDiscountField,
      });

      checkoutToken = checkout.checkoutToken;
      url = checkout.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : error;

      logger.error(
        {
          ...ctx,
          error: message,
        },
        `Error creating the checkout session`,
      );

      throw new Error(`Checkout not created`, { cause: error });
    }

    if (!url && !checkoutToken) {
      throw new Error(
        'Checkout session returned neither a URL nor a checkout token',
      );
    }

    logger.info(ctx, `Checkout session created. Returning result to client...`);

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
   * @description Creates a new billing portal session for a team account.
   *
   * Returns the billing portal `url`; the action wraps it as `{ url }` and the
   * client navigates via `window.location.assign(url)`.
   * @param accountId
   * @param slug
   */
  async createBillingPortalSession({
    accountId,
    slug,
  }: {
    accountId: string;
    slug: string;
  }) {
    const client = getSupabaseServerClient();
    const logger = await getLogger();

    logger.info(
      {
        accountId,
        name: this.namespace,
      },
      `Billing portal session requested. Processing...`,
    );

    const { data: user, error } = await requireUser(client);

    if (error ?? !user) {
      throw new Error('Authentication required');
    }

    const userId = user.id;

    const api = createTeamAccountsApi(client);

    // we require the user to have permissions to manage billing for the account
    const hasPermission = await api.hasPermission({
      userId,
      accountId,
      permission: 'billing.manage',
    });

    // if the user does not have permission to manage billing for the account
    // then we should not proceed
    if (!hasPermission) {
      logger.warn(
        {
          userId,
          accountId,
          name: this.namespace,
        },
        `User without permissions attempted to create billing portal session.`,
      );

      throw new Error('Permission denied');
    }

    const customerId = await api.getCustomerId(accountId);

    if (!customerId) {
      throw new Error('Customer not found');
    }

    logger.info(
      {
        userId,
        customerId,
        accountId,
        name: this.namespace,
      },
      `Creating billing portal session...`,
    );

    // get the billing gateway provider
    const service = await getBillingGatewayProvider(client);

    try {
      const returnUrl = getBillingPortalReturnUrl(slug);

      const { url } = await service.createBillingPortalSession({
        customerId,
        returnUrl,
      });

      // return the billing portal url to the caller
      return url;
    } catch (error) {
      logger.error(
        {
          userId,
          customerId,
          accountId,
          name: this.namespace,
          error,
        },
        `Billing Portal session was not created`,
      );

      throw new Error(`Error creating Billing Portal`, { cause: error });
    }
  }

  /**
   * Retrieves variant quantities for line items.
   */
  private async getVariantQuantities(
    lineItems: z.output<typeof LineItemSchema>[],
    accountId: string,
  ) {
    const variantQuantities: Array<{
      quantity: number;
      variantId: string;
    }> = [];

    for (const lineItem of lineItems) {
      // check if the line item is a per seat type
      const isPerSeat = lineItem.type === 'per_seat';

      if (isPerSeat) {
        // get the current number of members in the account
        const quantity = await this.getCurrentMembersCount(accountId);

        const item = {
          quantity,
          variantId: lineItem.id,
        };

        variantQuantities.push(item);
      }
    }

    // set initial quantity for the line items
    return variantQuantities;
  }

  private async getCurrentMembersCount(accountId: string) {
    const api = createTeamAccountsApi(this.client);
    const logger = await getLogger();

    try {
      const count = await api.getMembersCount(accountId);

      return count ?? 1;
    } catch (error) {
      logger.error(
        {
          accountId,
          error,
          name: `billing.checkout`,
        },
        `Encountered an error while fetching the number of existing seats`,
      );

      return Promise.reject(error as Error);
    }
  }
}

function getCheckoutSessionReturnUrl(accountSlug: string) {
  return getAccountUrl(pathsConfig.app.settingsBillingReturn, accountSlug);
}

function getBillingPortalReturnUrl(accountSlug: string) {
  return getAccountUrl(pathsConfig.app.settingsBilling, accountSlug);
}

function getAccountUrl(path: string, slug: string) {
  return new URL(path, appConfig.url).toString().replace('[account]', slug);
}

function getPlanDetails(productId: string, planId: string) {
  const product = billingConfig.products.find(
    (product) => product.id === productId,
  );

  if (!product) {
    throw new Error('Product not found');
  }

  const plan = product?.plans.find((plan) => plan.id === planId);

  if (!plan) {
    throw new Error('Plan not found');
  }

  return { plan, product };
}
