'use client';

import { Suspense, lazy, useSyncExternalStore } from 'react';

import { LoadingOverlay } from '@pymekit/ui/loading-overlay';

const DashboardDemoCharts = lazy(() => import('./dashboard-demo-charts.tsx'));

const Fallback = () => (
  <LoadingOverlay
    fullPage={false}
    className={'flex flex-1 flex-col items-center justify-center'}
  />
);

const subscribe = () => () => {};

// Client-only mount guard: recharts' `ResponsiveContainer` measures the DOM and
// warns/mismatches during SSR/hydration, so we render the charts only once the
// component is mounted on the client. `useSyncExternalStore` returns `false` on
// the server + first client render, then `true` after hydration.
export function DashboardDemo() {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  if (!isClient) {
    return <Fallback />;
  }

  return (
    <Suspense fallback={<Fallback />}>
      <DashboardDemoCharts />
    </Suspense>
  );
}
