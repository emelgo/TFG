'use client';

import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';

import { BillingPortalCard } from '@pymekit/billing-gateway/components';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { If } from '@pymekit/ui/if';
import { Trans } from '@pymekit/ui/trans';

import { createTeamAccountBillingPortalSession } from '#/lib/billing/billing.functions.ts';

export function TeamBillingPortalForm({
  accountId,
  slug,
}: {
  accountId: string;
  slug: string;
}) {
  const openPortal = useServerFn(createTeamAccountBillingPortalSession);

  const mutation = useMutation({
    mutationFn: (data: { accountId: string; slug: string }) =>
      openPortal({ data }),
    onSuccess: (result) => {
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
        mutation.mutate({ accountId, slug });
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
