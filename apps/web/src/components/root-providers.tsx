import { getMessages } from '@pymekit/i18n/messages';
import { I18nProvider } from '@pymekit/i18n/provider';
import { MonitoringProvider } from '@pymekit/monitoring/components';
import { AppEventsProvider } from '@pymekit/shared/events';
import { CSPProvider } from '@pymekit/ui/csp-provider';
import { If } from '@pymekit/ui/if';
import { Toaster } from '@pymekit/ui/sonner';
import { ThemeProvider } from '@pymekit/ui/theme';
import { TooltipProvider } from '@pymekit/ui/tooltip';
import { VersionUpdater } from '@pymekit/ui/version-updater';

import { AnalyticsProvider } from '#/components/analytics-provider.tsx';
import { AuthProvider } from '#/components/auth-provider.tsx';
import featureFlagsConfig from '#/config/feature-flags.config.ts';
import type { Theme } from '#/lib/theme.ts';

/**
 * Root client providers.
 *
 * The TanStack Query provider is wired automatically by the router's SSR query
 * integration (see src/router.tsx), so it is not mounted here.
 *
 * STEP (migration): `MonitoringProvider`, `AppEventsProvider`, `AuthProvider`
 * and `I18nProvider` are ported. `MonitoringProvider` no-ops when no monitoring
 * provider is configured. `AuthProvider` must nest inside both `AppEventsProvider`
 * and `MonitoringProvider` (it calls `useAppEvents()` + `useMonitoring()`). The
 * remaining layers are added as their packages are ported — nesting order
 * (outer → inner) is preserved below.
 *
 * `I18nProvider` wraps `children` with the `use-intl` context; messages are
 * bundled per locale (`getMessages`) and resolved synchronously. `theme` is
 * accepted now so the signature is stable once the Theme provider lands.
 *
 * `nonce` is set only when the strict CSP is enabled (`ENABLE_STRICT_CSP=true`);
 * it flows to Base UI's `CSPProvider` so its inline `<style>` elements carry the
 * nonce. Undefined (and a no-op) otherwise.
 */
export function RootProviders({
  theme,
  locale,
  nonce,
  children,
}: React.PropsWithChildren<{
  theme: Theme;
  locale: string;
  nonce?: string;
}>) {
  return (
    <CSPProvider nonce={nonce}>
      <MonitoringProvider>
        <AppEventsProvider>
          <AnalyticsProvider>
            <AuthProvider>
              <I18nProvider locale={locale} messages={getMessages(locale)}>
                <ThemeProvider initialTheme={theme}>
                  <TooltipProvider>{children}</TooltipProvider>

                  <If condition={featureFlagsConfig.enableVersionUpdater}>
                    <VersionUpdater />
                  </If>

                  <Toaster richColors position="top-center" />
                </ThemeProvider>
              </I18nProvider>
            </AuthProvider>
          </AnalyticsProvider>
        </AppEventsProvider>
      </MonitoringProvider>
    </CSPProvider>
  );
}
