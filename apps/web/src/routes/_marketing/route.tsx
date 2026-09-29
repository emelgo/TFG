import { Outlet, createFileRoute } from '@tanstack/react-router';

import { SiteFooter } from '#/components/marketing/site-footer.tsx';
import { SiteHeader } from '#/components/marketing/site-header.tsx';

// Pathless marketing layout: wraps the public site (landing, pricing, blog,
// docs, legal) with the shared header + footer. `context.user` comes from the
// root `beforeLoad` — the header renders the account dropdown when signed in,
// sign-in/up buttons otherwise. No auth gate: these pages are public.
export const Route = createFileRoute('/_marketing')({
  component: SiteLayout,
});

function SiteLayout() {
  const { user } = Route.useRouteContext();

  return (
    <div className={'flex min-h-screen flex-col'}>
      <SiteHeader user={user} />

      <Outlet />

      <SiteFooter />
    </div>
  );
}
