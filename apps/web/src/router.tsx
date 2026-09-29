import { QueryClient } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { getGlobalStartContext } from '@tanstack/react-start';

import { defaultLocale } from '@pymekit/i18n';
import { GlobalLoader } from '@pymekit/ui/global-loader';

import { getDefaultTheme } from './lib/theme';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
      },
    },
  });

  const router = createTanStackRouter({
    routeTree,
    // `user`, `locale` and `theme` are populated per-request by the root route's
    // beforeLoad; seed them so the context type (RouterContext) is satisfied at
    // creation.
    context: {
      queryClient,
      user: null,
      locale: defaultLocale,
      theme: getDefaultTheme(),
    },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: () => <GlobalLoader />,
  });

  // Strict CSP: on the server the per-request nonce is placed on the global
  // Start context by `securityHeadersMiddleware` (see src/start.ts). Setting
  // `ssr.nonce` makes TanStack tag every framework-injected `<script>` and emit
  // the `csp-nonce` meta tag; on the client this context is empty and the
  // framework recovers the nonce from that meta tag on hydration.
  //
  // `getRouter()` also runs outside the request's AsyncLocalStorage scope — the
  // framework calls it to resolve a server-thrown `redirect({ to })` after the
  // handler's context has already closed — where `getGlobalStartContext()`
  // throws. The nonce is only needed during SSR render (inside the scope), so
  // fall back to no nonce when the context is unavailable.
  const nonce = getRequestNonce();

  if (nonce) {
    router.options.ssr = { ...router.options.ssr, nonce };
  }

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

function getRequestNonce() {
  try {
    return (getGlobalStartContext() as { nonce?: string } | undefined)?.nonce;
  } catch {
    return undefined;
  }
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
