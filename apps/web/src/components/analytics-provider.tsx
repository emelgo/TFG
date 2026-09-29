'use client';

import { useEffect } from 'react';

import { useRouter } from '@tanstack/react-router';

import { analytics } from '@pymekit/analytics';
import {
  type AppEvent,
  type AppEventType,
  type ConsumerProvidedEventTypes,
  useAppEvents,
} from '@pymekit/shared/events';
import { isBrowser } from '@pymekit/shared/utils';

type AnalyticsMapping<
  T extends ConsumerProvidedEventTypes = NonNullable<unknown>,
> = {
  [K in AppEventType<T>]?: (event: AppEvent<T, K>) => unknown;
};

/**
 * Map app events to analytics actions. Add entries here to forward more app
 * events (emitted anywhere via `useAppEvents().emit(...)`) to the analytics
 * service.
 */
const analyticsMapping: AnalyticsMapping = {
  'user.signedIn': (event) => {
    const { userId, ...traits } = event.payload;

    if (userId) {
      return analytics.identify(userId, traits);
    }
  },
  'user.signedUp': (event) => analytics.trackEvent(event.type, event.payload),
  'checkout.started': (event) =>
    analytics.trackEvent(event.type, event.payload),
  'user.updated': (event) => analytics.trackEvent(event.type, event.payload),
};

/**
 * Subscribe to app events and forward them to the analytics service per the
 * mapping above.
 */
function useAnalyticsMapping<T extends ConsumerProvidedEventTypes>(
  mapping: AnalyticsMapping<T>,
) {
  // `on`/`off` are stable callbacks from the provider; depend on them rather
  // than the freshly-created context object.
  const { on, off } = useAppEvents<T>();

  useEffect(() => {
    const entries = Object.entries(mapping) as Array<
      [AppEventType<T>, (event: AppEvent<T, AppEventType<T>>) => unknown]
    >;

    entries.forEach(([type, handler]) => on(type, handler));

    return () => entries.forEach(([type, handler]) => off(type, handler));
  }, [on, off, mapping]);
}

/**
 * Report a page view on every resolved navigation. TanStack Router's
 * `onResolved` event fires after the destination route has loaded; it does not
 * fire for the initial document load, so we report that one explicitly on mount.
 */
function useReportPageView() {
  const router = useRouter();

  useEffect(() => {
    void analytics.trackPageView(router.state.location.href);

    return router.subscribe('onResolved', ({ toLocation }) => {
      void analytics.trackPageView(toLocation.href);
    });
  }, [router]);
}

function AnalyticsProviderBrowser(props: React.PropsWithChildren) {
  useAnalyticsMapping(analyticsMapping);
  useReportPageView();

  return props.children;
}

/**
 * Wires the analytics service into the app: forwards mapped app events and
 * tracks page views on navigation. Renders as a no-op on the server, and stays
 * inert until a concrete analytics provider is registered (the kit ships only a
 * null provider by default — see `@pymekit/analytics`).
 */
export function AnalyticsProvider(props: React.PropsWithChildren) {
  if (!isBrowser()) {
    return props.children;
  }

  return <AnalyticsProviderBrowser>{props.children}</AnalyticsProviderBrowser>;
}
