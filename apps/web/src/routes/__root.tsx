import { TanStackDevtools } from '@tanstack/react-devtools';
import type { QueryClient } from '@tanstack/react-query';
import {
  type ErrorComponentProps,
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';

import { useCaptureException } from '@pymekit/monitoring/hooks';

import { ErrorPageContent } from '#/components/error-page-content.tsx';
import { RootProviders } from '#/components/root-providers.tsx';
import { fetchSession, type Session } from '#/lib/auth/session.functions.ts';
import { detectLocale } from '#/lib/i18n/i18n.functions.ts';
import { buildCanonicalLink, getRootHead } from '#/lib/root-metadata.ts';
import { getServerTheme } from '#/lib/theme.functions.ts';
import { getRootClassName, type Theme } from '#/lib/theme.ts';

import appCss from '../styles.css?url';

interface RouterContext {
  queryClient: QueryClient;
  user: Session;
  locale: string;
  theme: Theme;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  // Single token-refresh point (replaces proxy.ts middleware): the cookie-writing
  // server client reads the JWT via getClaims() and persists any rotated refresh
  // cookie. Child routes read `context.user` without re-fetching (avoids Set-Cookie
  // races). This is UX-only — RLS still enforces data access.
  // `detectLocale()` resolves the request locale (cookie → Accept-Language →
  // default); `getServerTheme()` reads the theme cookie so the `<html>` class is
  // correct on first paint (no theme flash). Both are threaded into router
  // context for the i18n + theme providers.
  beforeLoad: async () => {
    const [user, locale, theme] = await Promise.all([
      fetchSession(),
      detectLocale(),
      getServerTheme(),
    ]);

    return { user, locale, theme };
  },
  head: (ctx) => {
    const { meta, links } = getRootHead();

    // Canonical for the current page: the leaf match's pathname. Prevents
    // trailing-slash / query-string / host variants indexing as duplicates.
    const leaf = ctx.matches[ctx.matches.length - 1];
    const pathname = leaf?.pathname ?? '/';

    return {
      meta,
      links: [
        ...links,
        buildCanonicalLink(pathname),
        { rel: 'stylesheet', href: appCss },
      ],
    };
  },
  shellComponent: RootDocument,
  component: () => <Outlet />,
  errorComponent: RootErrorComponent,
  notFoundComponent: RootNotFound,
});

function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  // The root errorComponent is the last error boundary in the route tree;
  // report what it catches so these errors reach monitoring (mirrors the
  // Next.js kit's error.tsx).
  useCaptureException(error);

  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center">
      <ErrorPageContent
        statusCode="500"
        heading="common.genericError"
        subtitle="common.genericErrorSubHeading"
        reset={reset}
      />
    </div>
  );
}

function RootNotFound() {
  return (
    <div
      className="flex min-h-screen flex-1 flex-col items-center justify-center"
      data-testid="root-not-found"
    >
      <ErrorPageContent
        statusCode="404"
        heading="common.pageNotFound"
        subtitle="common.pageNotFoundSubHeading"
      />
    </div>
  );
}

const SYSTEM_THEME_SCRIPT = `if (matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.classList.replace('light', 'dark')`;

function RootDocument({ children }: { children: React.ReactNode }) {
  // `locale` + `theme` are resolved per-request in beforeLoad and read from the
  // router context here; `<html lang>`/class and the providers follow them.
  const { locale, theme } = Route.useRouteContext();

  // Strict CSP nonce: set on `ssr.nonce` in getRouter when ENABLE_STRICT_CSP is
  // on (undefined otherwise). The framework tags framework scripts and emits the
  // `csp-nonce` meta tag itself; we read the value here for the inline theme
  // script and client providers (Base UI's CSPProvider) so their inline styles
  // carry it.
  const nonce = useRouter().options.ssr?.nonce;

  return (
    <html
      lang={locale}
      className={getRootClassName(theme)}
      suppressHydrationWarning
    >
      <head>
        {/* The server can't read the OS preference: resolve `system` before
            first paint to avoid a light flash in dark mode. */}
        {theme === 'system' && (
          <script
            nonce={nonce}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }}
          />
        )}
        <HeadContent />
      </head>
      <body>
        <RootProviders theme={theme} locale={locale} nonce={nonce}>
          {children}
        </RootProviders>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
