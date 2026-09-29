import { createFileRoute } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';

import {
  CurrentLifetimeOrderCard,
  CurrentSubscriptionCard,
} from '@pymekit/billing-gateway/components';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { alertExtras } from '@pymekit/ui/alert-extras';
import { AppBreadcrumbs } from '@pymekit/ui/app-breadcrumbs';
import { If } from '@pymekit/ui/if';
import { PageBody } from '@pymekit/ui/page';
import { Trans } from '@pymekit/ui/trans';
import { cn } from '@pymekit/ui/utils';

import { BillingErrorPage } from '#/components/billing/billing-error-page.tsx';
import { PersonalAccountCheckoutForm } from '#/components/billing/personal-account-checkout-form.tsx';
import { PersonalBillingPortalForm } from '#/components/billing/personal-billing-portal-form.tsx';
import { TeamAccountCheckoutForm } from '#/components/billing/team-account-checkout-form.tsx';
import { TeamBillingPortalForm } from '#/components/billing/team-billing-portal-form.tsx';
import { HomePageHeader } from '#/components/home/home-page-header.tsx';
import { fetchActiveAccountBillingData } from '#/lib/billing/billing.functions.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/_authenticated/settings/billing/')({
  head: () => ({ meta: [{ title: getTranslator()('common.routes.billing') }] }),
  loader: () => fetchActiveAccountBillingData(),
  component: BillingPage,
  errorComponent: BillingErrorPage,
});

function BillingPage() {
  const {
    isPersonalAccount,
    accountId,
    slug,
    permissions,
    subscription,
    order,
    customerId,
    subscriptionProductPlan,
    orderProductPlan,
  } = Route.useLoaderData();

  const hasBillingData = subscription ?? order;

  // Personal accounts always manage their own billing; teams require the
  // `billing.manage` permission.
  const canManageBilling =
    isPersonalAccount || permissions.includes('billing.manage');

  const shouldShowBillingPortal = canManageBilling && customerId;

  return (
    <PageBody>
      <HomePageHeader
        title={<Trans i18nKey={'common.routes.billing'} />}
        description={<AppBreadcrumbs />}
      />

      <div className={cn('flex max-w-2xl flex-col space-y-4')}>
        <If condition={!hasBillingData}>
          <If
            condition={canManageBilling}
            fallback={<CannotManageBillingAlert />}
          >
            {isPersonalAccount ? (
              <PersonalAccountCheckoutForm customerId={customerId} />
            ) : (
              <TeamAccountCheckoutForm
                customerId={customerId}
                accountId={accountId}
                slug={slug ?? ''}
              />
            )}
          </If>
        </If>

        <If condition={subscription}>
          {(subscription) => (
            <CurrentSubscriptionCard
              subscription={subscription}
              product={subscriptionProductPlan!.product}
              plan={subscriptionProductPlan!.plan}
            />
          )}
        </If>

        <If condition={order}>
          {(order) => (
            <CurrentLifetimeOrderCard
              order={order}
              product={orderProductPlan!.product}
              plan={orderProductPlan!.plan}
            />
          )}
        </If>

        {shouldShowBillingPortal ? (
          isPersonalAccount ? (
            <PersonalBillingPortalForm />
          ) : (
            <TeamBillingPortalForm accountId={accountId} slug={slug ?? ''} />
          )
        ) : null}
      </div>
    </PageBody>
  );
}

function CannotManageBillingAlert() {
  return (
    <Alert className={alertExtras.warning}>
      <TriangleAlert className={'h-4'} />

      <AlertTitle>
        <Trans i18nKey={'billing.cannotManageBillingAlertTitle'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'billing.cannotManageBillingAlertDescription'} />
      </AlertDescription>
    </Alert>
  );
}
