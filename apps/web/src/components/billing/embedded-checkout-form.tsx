'use client';

import { EmbeddedCheckout } from '@pymekit/billing-gateway/checkout';

// Thin client wrapper around the gateway's embedded checkout, used by the
// billing `return` pages when a checkout session is still open. `EmbeddedCheckout`
// already lazy-loads the provider bundle behind a `Suspense` boundary, so no
// `dynamic({ ssr: false })` wrapper is needed (unlike the Next.js version).
export const EmbeddedCheckoutForm = EmbeddedCheckout;
