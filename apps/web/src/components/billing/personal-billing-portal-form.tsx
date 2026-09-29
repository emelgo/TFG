'use client';

import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';

import { BillingPortalCard } from '@pymekit/billing-gateway/components';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { If } from '@pymekit/ui/if';
import { Trans } from '@pymekit/ui/trans';

import { createPersonalAccountBillingPortalSession } from '#/lib/billing/billing.functions.ts';

export function PersonalBillingPortalForm() {
  const openPortal = useServerFn(createPersonalAccountBillingPortalSession);

  const mutation = useMutation({
    mutationFn: () => openPortal(),
    onSuccess: (result) => {
      // the billing portal lives on the provider's domain; navigate manually
      // since TanStack's `redirect` cannot target external URLs.
      if (result?.url) {
        window.location.assign(result.url);
      }
    },
  });

  return (
    <form
      className={'flex flex-col space-y-4'}
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <If condition={mutation.isError}>
        <BillingPortalErrorAlert />
      </If>

      <BillingPortalCard pending={mutation.isPending} />
    </form>
  );
}

function BillingPortalErrorAlert() {
  return (
    <Alert variant={'destructive'}>
      <AlertTitle>
        <Trans i18nKey={'common.genericError'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'common.genericErrorSubHeading'} />
      </AlertDescription>
    </Alert>
  );
}
