/**
 * *Layout* de la gestión de cuentas de la plataforma (`/admin/accounts/**`).
 *
 * Solo añade la guarda: estas páginas son de la plataforma, así que exigen
 * super-admin y el personal del CMS se redirige a `/admin/cms` (ADR-014).
 * Las *server functions* que cargan los datos (`fetchAdminAccounts`,
 * `fetchAdminAccountPage`) lo vuelven a exigir con `adminFunctionMiddleware`.
 */
import { Outlet, createFileRoute } from '@tanstack/react-router';

import { requirePlatformAdmin } from '#/lib/admin/admin-guards.ts';

export const Route = createFileRoute('/admin/accounts')({
  beforeLoad: ({ context }) => requirePlatformAdmin(context.user),
  component: Outlet,
});
