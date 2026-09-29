'use client';

import { useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { TriangleAlertIcon } from 'lucide-react';

import { EmbeddedCheckout } from '@pymekit/billing-gateway/checkout';
import { PlanPicker } from '@pymekit/billing-gateway/components';
import { useAppEvents } from '@pymekit/shared/events';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pymekit/ui/card';
import { If } from '@pymekit/ui/if';
import { Trans } from '@pymekit/ui/trans';

import billingConfig from '#/config/billing.config.ts';
import { createTeamAccountCheckoutSession } from '#/lib/billing/billing.functions.ts';

export function TeamAccountCheckoutForm(props: {
  accountId: string;
  slug: string;
  customerId: string | null | undefined;
}) {
  const appEvents = useAppEvents();

  const [checkoutToken, setCheckoutToken] = useState<string | undefined>(
    undefined,
  );

  const startCheckout = useServerFn(createTeamAccountCheckoutSession);

  const mutation = useMutation({
    mutationFn: (data: {
      planId: string;
      productId: string;
      slug: string;
      accountId: string;
    }) => startCheckout({ data }),
    onSuccess: (result) => {
      if (result?.checkoutToken) {
        setCheckoutToken(result.checkoutToken);
      } else if (result?.url) {
        window.location.assign(result.url);
      }
    },
  });

  // If the checkout token is set, render the embedded checkout component
  if (checkoutToken) {
    return (
      <EmbeddedCheckout
        checkoutToken={checkoutToken}
        provider={billingConfig.provider}
        onClose={() => setCheckoutToken(undefined)}
      />
    );
  }

  // only allow trial if the user is not already a customer
  const canStartTrial = !props.customerId;

  // Otherwise, render the plan picker component
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans i18nKey={'billing.manageTeamPlan'} />
        </CardTitle>

        <CardDescription>
          <Trans i18nKey={'billing.manageTeamPlanDescription'} />
        </CardDescription>
      </CardHeader>

      <CardContent className={'space-y-4'}>
        <If condition={mutation.isError}>
          <Alert variant={'destructive'}>
            <TriangleAlertIcon className={'h-4'} />

            <AlertTitle>
              <Trans i18nKey={'billing.planPickerAlertErrorTitle'} />
            </AlertTitle>

            <AlertDescription>
              <Trans i18nKey={'billing.planPickerAlertErrorDescription'} />
            </AlertDescription>
          </Alert>
        </If>

        <PlanPicker
          pending={mutation.isPending}
          config={billingConfig}
          canStartTrial={canStartTrial}
          onSubmit={({ planId, productId }) => {
            appEvents.emit({
              type: 'checkout.started',
              payload: {
                planId,
                account: props.slug,
              },
            });

            mutation.mutate({
              planId,
              productId,
              slug: props.slug,
              accountId: props.accountId,
            });
          }}
        />
      </CardContent>
    </Card>
  );
}
