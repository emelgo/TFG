'use client';

import type { ErrorComponentProps } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';

import { useCaptureException } from '@pymekit/monitoring/hooks';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { AppBreadcrumbs } from '@pymekit/ui/app-breadcrumbs';
import { Button } from '@pymekit/ui/button';
import { PageBody } from '@pymekit/ui/page';
import { Trans } from '@pymekit/ui/trans';

import { HomePageHeader } from '#/components/home/home-page-header.tsx';

/**
 * Scoped error boundary for the billing routes (ported from the Next.js kit's
 * `billing/error.tsx`). Renders inside the workspace shell — set as the
 * `errorComponent` of the billing child routes, so a failing billing loader
 * doesn't blow away the whole app shell — reports the error to monitoring and
 * offers a retry via the router's error reset.
 */
export function BillingErrorPage({ error, reset }: ErrorComponentProps) {
  useCaptureException(error);

  return (
    <PageBody>
      <HomePageHeader
        title={<Trans i18nKey={'common.routes.billing'} />}
        description={<AppBreadcrumbs />}
      />

      <div className={'flex flex-col space-y-4'}>
        <Alert variant={'destructive'}>
          <TriangleAlert className={'h-4'} />

          <AlertTitle>
            <Trans i18nKey={'billing.planPickerAlertErrorTitle'} />
          </AlertTitle>

          <AlertDescription>
            <Trans i18nKey={'billing.planPickerAlertErrorDescription'} />
          </AlertDescription>
        </Alert>

        <div>
          <Button variant={'outline'} onClick={reset}>
            <Trans i18nKey={'common.retry'} />
          </Button>
        </div>
      </div>
    </PageBody>
  );
}
