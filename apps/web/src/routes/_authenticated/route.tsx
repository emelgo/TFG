import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';

import { GlobalLoader } from '@pymekit/ui/global-loader';

import { WorkspaceContextProvider } from '#/components/workspace-context.tsx';
import featureFlagsConfig from '#/config/feature-flags.config.ts';
import pathsConfig from '#/config/paths.config.ts';
import { fetchAuthGate } from '#/lib/auth/mfa.functions.ts';
import { fetchWorkspace } from '#/lib/server/active-workspace.functions.ts';

// Guard shell for the authenticated area. Gates auth + MFA and loads the active
// account workspace, exposing it on the route context so nested sections can
// gate on the active account (personal vs team) without re-resolving it.
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    if (!context.user) {
      throw redirect({
        href: `${pathsConfig.auth.signIn}?next=${encodeURIComponent(location.href)}`,
      });
    }

    // Comprueba con Auth que la sesión siga existiendo (no basta el JWT):
    // una sesión borrada se trata como «sin sesión» → inicio de sesión (F3b).
    const gate = await fetchAuthGate();

    if (gate.signedOut) {
      throw redirect({
        href: `${pathsConfig.auth.signIn}?next=${encodeURIComponent(location.href)}`,
      });
    }

    if (gate.requiresMfa) {
      throw redirect({ href: pathsConfig.auth.verifyMfa });
    }

    const workspace = await fetchWorkspace();

    // Teams-only mode with no team: the personal account cannot be the working
    // surface, so route the user to create their first team. Exempt the
    // create-team route itself to avoid redirecting onto the redirect target.
    if (
      featureFlagsConfig.enableTeamsOnly &&
      workspace.account.is_personal_account &&
      location.pathname !== pathsConfig.app.createTeam
    ) {
      throw redirect({ href: pathsConfig.app.createTeam });
    }

    return { workspace };
  },
  component: AuthenticatedLayout,
  pendingComponent: () => <GlobalLoader displayLogo fullPage />,
});

function AuthenticatedLayout() {
  const { workspace } = Route.useRouteContext();

  return (
    <WorkspaceContextProvider value={workspace}>
      <Outlet />
    </WorkspaceContextProvider>
  );
}
