/**
 * Explorador de datos: ficha de un registro por su clave de una columna
 * (`/admin/cms/resources/$schema/$table/record/$id`).
 *
 * El valor de la clave va en la ruta; la columna se deduce del metadato de
 * la tabla (`loadCmsRecordById`). La URL solo guarda además la página de
 * cada sección de registros relacionados (`RecordSearchSchema`). Un 403 o
 * 404 de la API se muestra como «no encontrado». Hereda la guarda de acceso
 * del *layout* `/admin/cms`.
 *
 * [TFG] RF-09 · ADR-011 · ADR-013: ficha del explorador como ruta de la web.
 */
import { createFileRoute } from '@tanstack/react-router';

import {
  RecordSearchSchema,
  withRelatedPage,
} from '@pymekit/cms-data-explorer-ui/utils';

import {
  CmsRecordError,
  CmsRecordPage,
} from '#/components/admin/cms/cms-record-page.tsx';
import { loadCmsRecordById } from '#/lib/cms/cms-record.ts';

export const Route = createFileRoute(
  '/admin/cms/resources/$schema/$table/record/$id/',
)({
  validateSearch: RecordSearchSchema,
  loader: async ({ context, params }) => {
    // Sin acceso válido (aviso de MFA) el *layout* no renderiza la página.
    if (context.cmsAccess.status !== 'ok') {
      return { keys: {} };
    }

    return loadCmsRecordById(context.queryClient, params);
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.schema}.${params.table} · ${params.id}` }],
  }),
  component: RecordByIdPage,
  errorComponent: ({ reset }) => <CmsRecordError reset={reset} />,
});

function RecordByIdPage() {
  const { schema, table } = Route.useParams();
  const { keys } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <CmsRecordPage
      schema={schema}
      table={table}
      keys={keys}
      relatedPages={search.relatedPages}
      onRelatedPageChange={(relationKey, page) => {
        void navigate({
          search: (previous) => withRelatedPage(previous, relationKey, page),
          resetScroll: false,
        });
      }}
    />
  );
}
