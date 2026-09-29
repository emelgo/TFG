/**
 * Explorador de datos: edición de un registro con clave compuesta
 * (`/admin/cms/resources/$schema/$table/record/edit?col1=a&col2=b`).
 *
 * Las columnas de la clave van en la URL, igual que en su ficha
 * (`parseRecordKeysSearch`). El `loader` precarga la ficha y comprueba el
 * permiso `update` (`loadCmsRecordForEdit`); sin él, sin claves o con un
 * 403/404 de la API, la página es «no encontrado». Hereda la guarda de
 * acceso del *layout* `/admin/cms`.
 *
 * [TFG] RF-09 · ADR-011 · ADR-013: edición de registros como ruta de la web.
 */
import { createFileRoute } from '@tanstack/react-router';

import {
  DATA_EXPLORER_BASE_PATH,
  getRecordKeysFromSearch,
  parseRecordKeysSearch,
} from '@pymekit/cms-data-explorer-ui/utils';

import {
  CmsRecordEditPage,
  CmsRecordError,
} from '#/components/admin/cms/cms-record-page.tsx';
import { loadCmsRecordForEdit } from '#/lib/cms/cms-record.ts';

export const Route = createFileRoute(
  '/admin/cms/resources/$schema/$table/record/edit',
)({
  validateSearch: parseRecordKeysSearch,
  loaderDeps: ({ search }) => ({ keys: getRecordKeysFromSearch(search) }),
  loader: async ({ context, params, deps }) => {
    // Sin acceso válido (aviso de MFA) el *layout* no renderiza la página.
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    await loadCmsRecordForEdit(context.queryClient, {
      ...params,
      keys: deps.keys,
    });
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.schema}.${params.table}` }],
  }),
  component: RecordByKeysEditPage,
  errorComponent: ({ reset }) => <CmsRecordError reset={reset} />,
});

function RecordByKeysEditPage() {
  const { schema, table } = Route.useParams();
  const keys = getRecordKeysFromSearch(Route.useSearch());

  return (
    <CmsRecordEditPage
      schema={schema}
      table={table}
      keys={keys}
      recordHref={`${DATA_EXPLORER_BASE_PATH}/${encodeURIComponent(
        schema,
      )}/${encodeURIComponent(table)}/record?${new URLSearchParams(
        keys,
      ).toString()}`}
    />
  );
}
