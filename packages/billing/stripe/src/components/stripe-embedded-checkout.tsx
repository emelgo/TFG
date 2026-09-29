'use client';

import { useState } from 'react';

import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

import { Dialog, DialogContent, DialogTitle } from '@pymekit/ui/dialog';

import { StripeClientEnvSchema } from '../schema/stripe-client-env.schema';

const { publishableKey } = StripeClientEnvSchema.parse({
  publishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
});

const stripePromise = loadStripe(publishableKey as string);

export function StripeCheckout({
  checkoutToken,
  onClose,
}: React.PropsWithChildren<{
  checkoutToken: string;
  onClose?: () => void;
}>) {
  return (
    <EmbeddedCheckoutPopup key={checkoutToken} onClose={onClose}>
      <EmbeddedCheckoutProvider
        stripe={stripePromise}
        options={{ clientSecret: checkoutToken }}
      >
        <EmbeddedCheckout className={'EmbeddedCheckoutClassName'} />
      </EmbeddedCheckoutProvider>
    </EmbeddedCheckoutPopup>
  );
}

function EmbeddedCheckoutPopup({
  onClose,
  children,
}: React.PropsWithChildren<{
  onClose?: () => void;
}>) {
  const [open, setOpen] = useState(true);
  const className = `bg-white p-4 overflow-y-auto shadow-transparent border w-full min-w-md max-w-4xl`;

  return (
    <Dialog
      defaultOpen
      open={open}
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open && onClose) {
          onClose();
        }

        setOpen(open);
      }}
    >
      <DialogContent
        style={{
          maxHeight: '98vh',
        }}
        className={className}
      >
        <DialogTitle className={'hidden'}>Checkout</DialogTitle>
        <div>{children}</div>
      </DialogContent>
    </Dialog>
  );
}
