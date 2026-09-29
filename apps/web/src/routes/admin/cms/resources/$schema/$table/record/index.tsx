/**
 * Explorador de datos: ficha de un registro con clave compuesta
 * (`/admin/cms/resources/$schema/$table/record?col1=a&col2=b`).
 *
 * Cada columna de la clave es un parámetro de la URL, tal como la genera
 * `buildResourceUrl` (por ejemplo, un miembro de una cuenta:
 * `?user_id=…&account_id=…`). `parseRecordKeysSearch` las valida como texto
 * y reserva `relatedPages` para la página de cada sección relacionada; solo
 * las claves son dependencias del `loader`, así que paginar una sección no
 * vuelve a pedir la ficha. Sin claves, o con un 403/404 de la API, la página
 * es «no encontrado».
 *
 * [TFG] RF-09 · ADR-011 · ADR-013: ficha del explorador como ruta de la web.
 */
import { createFileRoute } from '@tanstack/react-router';

import {
  getRecordKeysFromSearch,
  parseRecordKeysSearch,
  withRelatedPage,
} from '@pymekit/cms-data-explorer-ui/utils';

import {
  CmsRecordError,
  CmsRecordPage,
} from '#/components/admin/cms/cms-record-page.tsx';
import { loadCmsRecord } from '#/lib/cms/cms-record.ts';

export const Route = createFileRoute(
  '/admin/cms/resources/$schema/$table/record/',
)({
  validateSearch: parseRecordKeysSearch,
  loaderDeps: ({ search }) => ({ keys: getRecordKeysFromSearch(search) }),
  loader: async ({ context, params, deps }) => {
    // Sin acceso válido (aviso de MFA) el *layout* no renderiza la página.
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    await loadCmsRecord(context.queryClient, { ...params, keys: deps.keys });
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.schema}.${params.table}` }],
  }),
  component: RecordByKeysPage,
  errorComponent: ({ reset }) => <CmsRecordError reset={reset} />,
});

function RecordByKeysPage() {
  const { schema, table } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <CmsRecordPage
      schema={schema}
      table={table}
      keys={getRecordKeysFromSearch(search)}
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
