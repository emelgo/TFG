/**
 * *Layout* del CMS integrado en la consola de administración (`/admin/cms`).
 *
 * Todas las pantallas del CMS cuelgan de esta ruta, que hace tres cosas:
 *
 *  1. **Comprueba el acceso** con la API del CMS (`loadCmsAccess`, que pide
 *     `GET /v1/account` con `context.queryClient.ensureQueryData`): 401 →
 *     inicio de sesión; 403 por MFA o cuenta inactiva → aviso con enlace a la
 *     verificación en dos pasos; cualquier otro 403 → 404.
 *  2. **Publica el resultado**: el estado de acceso y las secciones
 *     permitidas en el contexto del *router* (`context.cmsAccess`, para los
 *     *loaders* y guardas de las rutas hijas) y la cuenta completa en un
 *     contexto React (`useCmsAccount()`).
 *  3. Muestra un aviso de error con reintento si la API falla por otro motivo.
 *
 * La comprobación va en `beforeLoad` y no en `loader` a propósito: TanStack
 * Router ejecuta los `beforeLoad` en serie (padre → hijos) pero los `loader`
 * en paralelo, así que solo en `beforeLoad` se garantiza que ninguna ruta
 * hija pida datos al CMS antes de saber si el usuario tiene acceso.
 *
 * [TFG] RF-09 · ADR-011 · ADR-014: interfaz del CMS como rutas de la web, con
 * la API como única fuente de autorización.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  type ErrorComponentProps,
  Outlet,
  createFileRoute,
  useLocation,
} from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';

import { CmsAccountProvider } from '@pymekit/cms-ui-core/account-context';
import {
  EmptyMedia,
  EmptyState,
  EmptyStateButton,
  EmptyStateHeading,
  EmptyStateText,
} from '@pymekit/ui/empty-state';
import { PageBody } from '@pymekit/ui/page';
import { Trans } from '@pymekit/ui/trans';

import { CmsAccessRequired } from '#/components/admin/cms/cms-access-required.tsx';
import { loadCmsAccess } from '#/lib/cms/cms-access.ts';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';

export const Route = createFileRoute('/admin/cms')({
  beforeLoad: async ({ context, location }) => {
    const cmsAccess = await loadCmsAccess({
      queryClient: context.queryClient,
      href: location.href,
    });

    return { cmsAccess };
  },
  component: CmsLayout,
  errorComponent: CmsLayoutError,
});

function CmsLayout() {
  const { cmsAccess } = Route.useRouteContext();
  const location = useLocation();

  if (cmsAccess.status !== 'ok') {
    return <CmsAccessRequired next={location.href} />;
  }

  return <CmsAccountOutlet />;
}

/**
 * Publica la cuenta del CMS para las pantallas hijas. Los datos ya están en
 * la caché (los cargó `beforeLoad`), así que `useSuspenseQuery` no suspende;
 * se lee de la caché y no del contexto del *router* para que la cuenta se
 * mantenga al día si TanStack Query la vuelve a pedir.
 */
function CmsAccountOutlet() {
  const { data } = useSuspenseQuery(cmsQueries.account());

  return (
    <CmsAccountProvider value={data}>
      <Outlet />
    </CmsAccountProvider>
  );
}

function CmsLayoutError({ reset }: ErrorComponentProps) {
  return (
    <PageBody className="py-8">
      <EmptyState data-testid="cms-load-error" className="min-h-64 p-6">
        <EmptyMedia variant="icon">
          <TriangleAlert />
        </EmptyMedia>

        <EmptyStateHeading>
          <Trans i18nKey="cms.access.loadErrorHeading" />
        </EmptyStateHeading>

        <EmptyStateText>
          <Trans i18nKey="cms.access.loadErrorText" />
        </EmptyStateText>

        <EmptyStateButton onClick={reset}>
          <Trans i18nKey="cms.access.retry" />
        </EmptyStateButton>
      </EmptyState>
    </PageBody>
  );
}
