import { Suspense, lazy } from 'react';

import type { Enums } from '@pymekit/supabase/database';
import { LoadingOverlay } from '@pymekit/ui/loading-overlay';

type BillingProvider = Enums<'billing_provider'>;

// Create lazy components at module level (not during render)
const StripeCheckoutLazy = lazy(async () => {
  const { StripeCheckout } = await import('@pymekit/stripe/components');

  return { default: StripeCheckout };
});

type CheckoutProps = {
  onClose: (() => unknown) | undefined;
  checkoutToken: string;
};

export function EmbeddedCheckout(
  props: React.PropsWithChildren<{
    checkoutToken: string;
    provider: BillingProvider;
    onClose?: () => void;
  }>,
) {
  return (
    <>
      <Suspense fallback={<LoadingOverlay fullPage={false} />}>
        <CheckoutSelector
          provider={props.provider}
          onClose={props.onClose}
          checkoutToken={props.checkoutToken}
        />
      </Suspense>
    </>
  );
}

function CheckoutSelector(
  props: CheckoutProps & { provider: BillingProvider },
) {
  switch (props.provider) {
    case 'stripe':
      return (
        <StripeCheckoutLazy
          onClose={props.onClose}
          checkoutToken={props.checkoutToken}
        />
      );

    default:
      throw new Error(`Unsupported provider: ${props.provider as string}`);
  }
}
