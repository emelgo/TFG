'use client';

import { useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { TriangleAlert } from 'lucide-react';

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
import { createPersonalAccountCheckoutSession } from '#/lib/billing/billing.functions.ts';

export function PersonalAccountCheckoutForm(props: {
  customerId: string | null | undefined;
}) {
  const appEvents = useAppEvents();

  const [checkoutToken, setCheckoutToken] = useState<string | undefined>(
    undefined,
  );

  const startCheckout = useServerFn(createPersonalAccountCheckoutSession);

  const mutation = useMutation({
    mutationFn: (data: { planId: string; productId: string }) =>
      startCheckout({ data }),
    onSuccess: (result) => {
      if (result?.checkoutToken) {
        // embedded checkout: render the checkout inline with the token
        setCheckoutToken(result.checkoutToken);
      } else if (result?.url) {
        // hosted checkout: TanStack's `redirect` cannot target external URLs,
        // so we navigate to the provider's hosted page manually.
        window.location.assign(result.url);
      }
    },
  });

  // only allow trial if the user is not already a customer
  const canStartTrial = !props.customerId;

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

  // Otherwise, render the plan picker component
  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>
            <Trans i18nKey={'billing.planCardLabel'} />
          </CardTitle>

          <CardDescription>
            <Trans i18nKey={'billing.planCardDescription'} />
          </CardDescription>
        </CardHeader>

        <CardContent className={'space-y-4'}>
          <If condition={mutation.isError}>
            <ErrorAlert />
          </If>

          <PlanPicker
            pending={mutation.isPending}
            config={billingConfig}
            canStartTrial={canStartTrial}
            onSubmit={({ planId, productId }) => {
              appEvents.emit({
                type: 'checkout.started',
                payload: { planId },
              });

              mutation.mutate({ planId, productId });
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorAlert() {
  return (
    <Alert variant={'destructive'}>
      <TriangleAlert className={'h-4'} />

      <AlertTitle>
        <Trans i18nKey={'billing.planPickerAlertErrorTitle'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'billing.planPickerAlertErrorDescription'} />
      </AlertDescription>
    </Alert>
  );
}
