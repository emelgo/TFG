import { notFound, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import * as z from 'zod';

import { createAccountsApi } from '@pymekit/accounts/api';
import {
  getBillingGatewayProvider,
  resolveProductPlan,
} from '@pymekit/billing-gateway';
import { authFunctionMiddleware } from '@pymekit/function-middleware/functions';
import {
  authMiddleware,
  errorMiddleware,
  withFeaturePermission,
} from '@pymekit/function-middleware/server';
import { requireUser } from '@pymekit/supabase/require-user';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

import billingConfig from '#/config/billing.config.ts';
import featureFlagsConfig from '#/config/feature-flags.config.ts';
import pathsConfig from '#/config/paths.config.ts';

import { PersonalAccountCheckoutSchema } from './schema/personal-account-checkout.schema';
import {
  TeamBillingPortalSchema,
  TeamCheckoutSchema,
} from './schema/team-billing.schema';
import { createTeamBillingService } from './team-billing.service.server';
import { createUserBillingService } from './user-billing.service.server';

/**
 * Loads billing-page data for the active account (`/settings/billing`).
 *
 * Serves both surfaces: personal accounts use the account id (= user id); team
 * accounts use the resolved team id. Billing is gated per surface by the
 * relevant feature flag (redirecting to `/settings` when disabled). Returns
 * `isPersonalAccount` + the active account's `permissions` so the page can pick
 * the right checkout form and derive `billing.manage`.
 */
export const fetchActiveAccountBillingData = createServerFn({ method: 'GET' })
  .middleware([errorMiddleware])
  .handler(async () => {
    const client = getSupabaseServerClient();

    const auth = await requireUser(client);

    if (auth.error) {
      throw redirect({ href: auth.redirectTo });
    }

    const workspace = await client.rpc('active_account_workspace');

    if (workspace.error) {
      throw workspace.error;
    }

    const account = workspace.data[0];

    if (!account) {
      throw redirect({ href: pathsConfig.app.settings });
    }

    const isPersonalAccount = !!account.is_personal_account;

    const billingEnabled = isPersonalAccount
      ? featureFlagsConfig.enablePersonalAccountBilling
      : featureFlagsConfig.enableTeamAccountBilling;

    if (!billingEnabled) {
      throw redirect({ href: pathsConfig.app.settings });
    }

    const accountId = account.id;
    const api = createAccountsApi(client);

    const [subscription, order, customerId] = await Promise.all([
      api.getSubscription(accountId),
      api.getOrder(accountId),
      api.getCustomerId(accountId),
    ]);

    const subscriptionVariantId = subscription?.items[0]?.variant_id;
    const orderVariantId = order?.items[0]?.variant_id;

    const subscriptionProductPlan =
      subscription && subscriptionVariantId
        ? await resolveProductPlan(
            billingConfig,
            subscriptionVariantId,
            subscription.currency,
          )
        : null;

    const orderProductPlan =
      order && orderVariantId
        ? await resolveProductPlan(
            billingConfig,
            orderVariantId,
            order.currency,
          )
        : null;

    return {
      isPersonalAccount,
      accountId,
      slug: account.slug,
      permissions: account.permissions ?? [],
      subscription,
      order,
      customerId,
      subscriptionProductPlan,
      orderProductPlan,
    };
  });

const SessionSchema = z.object({
  sessionId: z.string().min(1),
});

const billingManageMiddleware = [
  errorMiddleware,
  authMiddleware,
  withFeaturePermission('billing.manage'),
];

/**
 * Retrieves a checkout session for the billing `return` page (shared by both
 * personal and team return routes).
 *
 * Replaces the Next.js `loadCheckoutSession` in the return page. When the
 * session is still open it returns the embedded `checkoutToken` so the client
 * can resume the embedded checkout; otherwise it returns the session status and
 * customer email for the confirmation UI. Missing session → `notFound()`.
 */
export const fetchCheckoutSession = createServerFn({ method: 'GET' })
  .middleware([errorMiddleware])
  .validator(SessionSchema)
  .handler(async ({ data }) => {
    const client = getSupabaseServerClient();

    const auth = await requireUser(client);

    if (auth.error) {
      throw redirect({ href: auth.redirectTo });
    }

    const gateway = await getBillingGatewayProvider(client);

    const session = await gateway.retrieveCheckoutSession({
      sessionId: data.sessionId,
    });

    if (!session) {
      throw notFound();
    }

    return {
      status: session.status,
      customerEmail: session.customer.email,
      checkoutToken: session.isSessionOpen ? session.checkoutToken : null,
    };
  });

/**
 * Creates a checkout session for a personal account.
 *
 * Returns `{ url, checkoutToken }`. The client navigates to `url` for hosted
 * checkout (`window.location.assign`) or renders the embedded checkout with
 * `checkoutToken`.
 */
export const createPersonalAccountCheckoutSession = createServerFn({
  method: 'POST',
})
  .middleware(authFunctionMiddleware)
  .validator(PersonalAccountCheckoutSchema)
  .handler(async ({ data }) => {
    if (!featureFlagsConfig.enablePersonalAccountBilling) {
      throw new Error('Personal account billing is not enabled');
    }

    const client = getSupabaseServerClient();
    const service = createUserBillingService(client);

    return service.createCheckoutSession(data);
  });

/**
 * Creates a billing portal session for a personal account.
 *
 * External URLs are returned to the client so it can navigate with
 * `window.location.assign(url)`.
 */
export const createPersonalAccountBillingPortalSession = createServerFn({
  method: 'POST',
})
  .middleware(authFunctionMiddleware)
  .handler(async () => {
    if (!featureFlagsConfig.enablePersonalAccountBilling) {
      throw new Error('Personal account billing is not enabled');
    }

    const client = getSupabaseServerClient();
    const service = createUserBillingService(client);

    const url = await service.createBillingPortalSession();

    return { url };
  });

/**
 * Creates a checkout session for a team account.
 *
 * Gated by the `billing.manage` feature permission on the account. The
 * validated input carries the uuid `accountId` the gate requires; the service
 * re-checks the permission too.
 */
export const createTeamAccountCheckoutSession = createServerFn({
  method: 'POST',
})
  .middleware(billingManageMiddleware)
  .validator(TeamCheckoutSchema)
  .handler(async ({ data }) => {
    if (!featureFlagsConfig.enableTeamAccountBilling) {
      throw new Error('Team account billing is not enabled');
    }

    const client = getSupabaseServerClient();
    const service = createTeamBillingService(client);

    return service.createCheckout(data);
  });

/**
 * Creates a billing portal session for a team account.
 *
 * Gated by the `billing.manage` feature permission. External URLs are returned
 * to the client so it can navigate with `window.location.assign(url)`.
 */
export const createTeamAccountBillingPortalSession = createServerFn({
  method: 'POST',
})
  .middleware(billingManageMiddleware)
  .validator(TeamBillingPortalSchema)
  .handler(async ({ data }) => {
    if (!featureFlagsConfig.enableTeamAccountBilling) {
      throw new Error('Team account billing is not enabled');
    }

    const client = getSupabaseServerClient();
    const service = createTeamBillingService(client);

    const url = await service.createBillingPortalSession(data);

    return { url };
  });
