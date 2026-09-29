'use client';

import { ArrowUpRight } from 'lucide-react';

import { Button } from '@pymekit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pymekit/ui/card';
import { Trans } from '@pymekit/ui/trans';

export function BillingPortalCard(props: { pending?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans i18nKey="billing.billingPortalCardTitle" />
        </CardTitle>

        <CardDescription>
          <Trans i18nKey="billing.billingPortalCardDescription" />
        </CardDescription>
      </CardHeader>

      <CardContent className={'space-y-2'}>
        <div>
          <Button
            type="submit"
            data-testid={'manage-billing-redirect-button'}
            disabled={props.pending}
          >
            {props.pending ? (
              <Trans i18nKey="common.loading" />
            ) : (
              <>
                <span>
                  <Trans i18nKey="billing.billingPortalCardButton" />
                </span>

                <ArrowUpRight className={'h-4'} />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
