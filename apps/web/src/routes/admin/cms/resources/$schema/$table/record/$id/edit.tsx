/**
 * Explorador de datos: edición de un registro por su clave de una columna
 * (`/admin/cms/resources/$schema/$table/record/$id/edit`).
 *
 * Como la ficha, deduce la columna de la clave del metadato de la tabla
 * (`loadCmsRecordById`) y después comprueba el permiso `update`
 * (`loadCmsRecordForEdit`); sin él la página es «no encontrado». Al guardar
 * o cancelar se vuelve a la ficha. Hereda la guarda de acceso del *layout*
 * `/admin/cms`.
 *
 * [TFG] RF-09 · ADR-011 · ADR-013: edición de registros como ruta de la web.
 */
import { createFileRoute } from '@tanstack/react-router';
import * as z from 'zod';

import { DATA_EXPLORER_BASE_PATH } from '@pymekit/cms-data-explorer-ui/utils';

import {
  CmsRecordEditPage,
  CmsRecordError,
} from '#/components/admin/cms/cms-record-page.tsx';
import {
  loadCmsRecordById,
  loadCmsRecordForEdit,
} from '#/lib/cms/cms-record.ts';

export const Route = createFileRoute(
  '/admin/cms/resources/$schema/$table/record/$id/edit',
)({
  // La página no usa parámetros de búsqueda: se descartan los que lleguen.
  validateSearch: z.object({}),
  loader: async ({ context, params }) => {
    // Sin acceso válido (aviso de MFA) el *layout* no renderiza la página.
    if (context.cmsAccess.status !== 'ok') {
      return { keys: {} };
    }

    const { keys } = await loadCmsRecordById(context.queryClient, params);

    await loadCmsRecordForEdit(context.queryClient, { ...params, keys });

    return { keys };
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.schema}.${params.table} · ${params.id}` }],
  }),
  component: RecordByIdEditPage,
  errorComponent: ({ reset }) => <CmsRecordError reset={reset} />,
});

function RecordByIdEditPage() {
  const { schema, table, id } = Route.useParams();
  const { keys } = Route.useLoaderData();

  return (
    <CmsRecordEditPage
      schema={schema}
      table={table}
      keys={keys}
      recordHref={`${DATA_EXPLORER_BASE_PATH}/${encodeURIComponent(
        schema,
      )}/${encodeURIComponent(table)}/record/${encodeURIComponent(id)}`}
    />
  );
}
