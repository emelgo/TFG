import { createFileRoute, redirect } from '@tanstack/react-router';

import { BillingSessionStatus } from '@pymekit/billing-gateway/components';

import { BillingErrorPage } from '#/components/billing/billing-error-page.tsx';
import { EmbeddedCheckoutForm } from '#/components/billing/embedded-checkout-form.tsx';
import billingConfig from '#/config/billing.config.ts';
import pathsConfig from '#/config/paths.config.ts';
import { readString } from '#/lib/auth/search-params.ts';
import { fetchCheckoutSession } from '#/lib/billing/billing.functions.ts';

interface ReturnSearch {
  session_id?: string;
}

// Unified checkout-return page for the slug-free settings billing surface.
// Works for both personal and team checkouts — the billing account is
// determined by the DB-backed active account, so the return path is stable.
export const Route = createFileRoute('/_authenticated/settings/billing/return')(
  {
    validateSearch: (search: Record<string, unknown>): ReturnSearch => ({
      session_id: readString(search.session_id),
    }),
    loaderDeps: ({ search }) => ({ sessionId: search.session_id }),
    loader: ({ deps }) => {
      if (!deps.sessionId) {
        throw redirect({ to: pathsConfig.app.settingsBilling });
      }

      return fetchCheckoutSession({ data: { sessionId: deps.sessionId } });
    },
    component: ReturnCheckoutSessionPage,
    errorComponent: BillingErrorPage,
  },
);

function ReturnCheckoutSessionPage() {
  const { customerEmail, checkoutToken } = Route.useLoaderData();

  if (checkoutToken) {
    return (
      <EmbeddedCheckoutForm
        checkoutToken={checkoutToken}
        provider={billingConfig.provider}
      />
    );
  }

  return (
    <>
      <div className={'fixed top-48 left-0 z-50 mx-auto w-full'}>
        <BillingSessionStatus
          redirectPath={pathsConfig.app.settingsBilling}
          customerEmail={customerEmail ?? ''}
        />
      </div>

      <BlurryBackdrop />
    </>
  );
}

function BlurryBackdrop() {
  return (
    <div
      className={
        'bg-background/30 fixed top-0 left-0 !m-0 h-full w-full backdrop-blur-sm'
      }
    />
  );
}
