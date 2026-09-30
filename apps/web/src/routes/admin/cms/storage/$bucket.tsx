/**
 * Explorador de almacenamiento del CMS: contenido de una carpeta
 * (`/admin/cms/storage/$bucket?path=…&page=…&search=…`).
 *
 * La carpeta va en los *search params* y se valida con `StorageSearchSchema`
 * (las mismas reglas de rutas que la API: sin `..`, absolutas ni
 * codificaciones). El `loader` precarga la página y el componente la lee con
 * `useSuspenseQuery`. La API vuelve a validar la ruta y exige
 * `cms.has_storage_permission` antes de usar el cliente de servicio; un
 * 403, 404 o 400 se muestra como «no encontrado».
 *
 * [TFG] RF-09 · RNF-02 · ADR-011 · ADR-013.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useRouterState } from '@tanstack/react-router';

import { FileExplorerView } from '@pymekit/cms-storage-explorer-ui/components';
import {
  type StorageSearch,
  StorageSearchSchema,
  toBucketContentsParams,
} from '@pymekit/cms-storage-explorer-ui/utils';
import { PageBody } from '@pymekit/ui/page';

import { CmsSectionError } from '#/components/admin/cms/cms-section-error.tsx';
import { requireCmsSection } from '#/lib/cms/cms-access.ts';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { rethrowCmsSectionError } from '#/lib/cms/cms-section-data.ts';

export const Route = createFileRoute('/admin/cms/storage/$bucket')({
  validateSearch: StorageSearchSchema,
  loaderDeps: ({ search }) => search,
  beforeLoad: ({ context }) => requireCmsSection(context.cmsAccess, 'storage'),
  loader: async ({ context, params, deps }) => {
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    try {
      await context.queryClient.ensureQueryData(
        cmsQueries.bucketContents(toBucketContentsParams(params.bucket, deps)),
      );
    } catch (error) {
      rethrowCmsSectionError(error);
    }
  },
  head: ({ params }) => ({ meta: [{ title: params.bucket }] }),
  component: BucketPage,
  errorComponent: ({ reset }) => (
    <CmsSectionError reset={reset} testId="storage-load-error" />
  ),
});

function BucketPage() {
  const { bucket } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data } = useSuspenseQuery(
    cmsQueries.bucketContents(toBucketContentsParams(bucket, search)),
  );

  const isLoading = useRouterState({
    select: (state) => state.status === 'pending',
  });

  return (
    <PageBody className="py-2">
      <FileExplorerView
        // Cambiar de carpeta monta la vista de nuevo: la selección no pasa
        // de una carpeta a otra.
        key={`${bucket}/${search.path ?? ''}`}
        bucket={bucket}
        data={data}
        search={search}
        isLoading={isLoading}
        onSearchChange={(next: StorageSearch) =>
          void navigate({ search: next, resetScroll: false })
        }
      />
    </PageBody>
  );
}
