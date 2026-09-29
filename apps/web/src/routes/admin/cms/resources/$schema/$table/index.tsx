/**
 * Explorador de datos: listado de una tabla
 * (`/admin/cms/resources/$schema/$table`).
 *
 * La ruta resuelve los datos y deja la presentación a
 * `DataExplorerTableView` (`@pymekit/cms-data-explorer-ui`):
 *
 *  - **URL como estado.** Página, tamaño, búsqueda, orden, filtros y vista
 *    guardada viven en los *search params*, validados con
 *    `DataExplorerSearchSchema`. Cambiarlos es navegar (`navigate({ search })`),
 *    así que el historial, los enlaces compartidos y el SSR funcionan igual.
 *  - **Datos con TanStack Query.** El `loader` depende de la URL
 *    (`loaderDeps`) y precarga la página con `ensureQueryData`; el componente
 *    la lee con `useSuspenseQuery` de la misma entrada de caché. Las vistas
 *    guardadas se precargan sin bloquear: si fallan, el listado se ve igual.
 *  - **Acceso.** La API vuelve a comprobar el permiso `select` sobre la tabla;
 *    un 403 (tabla sin permiso) o un 404 se muestran como «no encontrado»,
 *    igual que el resto de la consola con lo que el usuario no puede ver.
 *  - **Memoria de filtros.** Al volver a la tabla sin parámetros desde otra
 *    página (la barra lateral, por ejemplo) se restauran los últimos filtros
 *    de la sesión (`restoreFilterContext`); solo en el navegador.
 *
 * [TFG] RF-09 · ADR-011 · ADR-013: explorador de datos como ruta de la web.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  type ErrorComponentProps,
  createFileRoute,
  notFound,
  redirect,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';

import { ApiError } from '@pymekit/cms-api/client';
import { DataExplorerTableView } from '@pymekit/cms-data-explorer-ui/components';
import {
  type DataExplorerSearch,
  DataExplorerSearchSchema,
  restoreFilterContext,
  toTableDataParams,
} from '@pymekit/cms-data-explorer-ui/utils';
import { getCmsAccessFailure } from '@pymekit/cms-ui-core/errors';
import {
  EmptyMedia,
  EmptyState,
  EmptyStateButton,
  EmptyStateHeading,
  EmptyStateText,
} from '@pymekit/ui/empty-state';
import { PageBody } from '@pymekit/ui/page';
import { Trans } from '@pymekit/ui/trans';

import { cmsQueries } from '#/lib/cms/cms-queries.ts';

export const Route = createFileRoute('/admin/cms/resources/$schema/$table/')({
  validateSearch: DataExplorerSearchSchema,
  loaderDeps: ({ search }) => search,
  beforeLoad: ({ params, search, cause }) => {
    // Solo al entrar en la tabla desde otra página: dentro de la misma tabla
    // (`stay`) una URL vacía es intencionada (limpiar filtros, «atrás»).
    if (cause !== 'enter') {
      return;
    }

    const restored = restoreFilterContext(params.schema, params.table, search);

    if (restored) {
      throw redirect({
        to: '/admin/cms/resources/$schema/$table',
        params,
        search: DataExplorerSearchSchema.parse(restored),
        replace: true,
      });
    }
  },
  loader: async ({ context, params, deps }) => {
    // Sin acceso válido (aviso de MFA) el *layout* no renderiza la página.
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    void context.queryClient.prefetchQuery(
      cmsQueries.savedViews(params.schema, params.table),
    );

    // Permisos de escritura (crear, editar en línea, borrar): se precargan
    // sin bloquear; mientras llegan, las acciones simplemente no se ven.
    void context.queryClient.prefetchQuery(
      cmsQueries.tablePermissions(params.schema, params.table),
    );

    try {
      await context.queryClient.ensureQueryData(
        cmsQueries.tableData(
          toTableDataParams(params.schema, params.table, deps),
        ),
      );
    } catch (error) {
      if (
        getCmsAccessFailure(error) === 'forbidden' ||
        (error instanceof ApiError && error.status === 404)
      ) {
        throw notFound();
      }

      throw error;
    }
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.schema}.${params.table}` }],
  }),
  component: DataExplorerTablePage,
  errorComponent: DataExplorerTableError,
});

function DataExplorerTablePage() {
  const { schema, table } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data } = useSuspenseQuery(
    cmsQueries.tableData(toTableDataParams(schema, table, search)),
  );

  // Mientras el `loader` trae la nueva página se atenúa la tabla actual.
  const isLoading = useRouterState({
    select: (state) => state.status === 'pending',
  });

  const onSearchChange = (next: DataExplorerSearch) => {
    void navigate({ search: next, resetScroll: false });
  };

  return (
    <PageBody className="py-2">
      <DataExplorerTableView
        key={`${schema}.${table}`}
        schema={schema}
        table={table}
        data={data}
        search={search}
        onSearchChange={onSearchChange}
        isLoading={isLoading}
      />
    </PageBody>
  );
}

function DataExplorerTableError({ reset }: ErrorComponentProps) {
  const router = useRouter();

  return (
    <PageBody className="py-8">
      <EmptyState data-testid="data-explorer-error" className="min-h-64 p-6">
        <EmptyMedia variant="icon">
          <TriangleAlert />
        </EmptyMedia>

        <EmptyStateHeading>
          <Trans i18nKey="cms.dataExplorer.loadErrorHeading" />
        </EmptyStateHeading>

        <EmptyStateText>
          <Trans i18nKey="cms.dataExplorer.loadErrorText" />
        </EmptyStateText>

        <EmptyStateButton
          onClick={() => {
            reset();
            void router.invalidate();
          }}
        >
          <Trans i18nKey="cms.dataExplorer.retry" />
        </EmptyStateButton>
      </EmptyState>
    </PageBody>
  );
}
