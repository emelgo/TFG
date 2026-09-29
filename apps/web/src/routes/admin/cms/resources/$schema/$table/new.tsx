/**
 * Explorador de datos: nuevo registro
 * (`/admin/cms/resources/$schema/$table/new`).
 *
 * El `loader` precarga el metadato de la tabla (columnas editables, valores
 * por defecto, relaciones) y comprueba el permiso `insert`
 * (`loadCmsTableForCreate`); sin él, o sin acceso a la tabla, la página es
 * «no encontrado». El formulario lo pinta `RecordCreateView` de
 * `@pymekit/cms-data-explorer-ui` y la API vuelve a comprobar el permiso al
 * guardar. Hereda la guarda de acceso del *layout* `/admin/cms`.
 *
 * [TFG] RF-09 · ADR-011 · ADR-013: creación de registros como ruta de la web.
 */
import { createFileRoute } from '@tanstack/react-router';
import * as z from 'zod';

import {
  CmsRecordCreatePage,
  CmsRecordError,
} from '#/components/admin/cms/cms-record-page.tsx';
import { loadCmsTableForCreate } from '#/lib/cms/cms-record.ts';

export const Route = createFileRoute('/admin/cms/resources/$schema/$table/new')(
  {
    // La página no usa parámetros de búsqueda: se descartan los que lleguen.
    validateSearch: z.object({}),
    loader: async ({ context, params }) => {
      // Sin acceso válido (aviso de MFA) el *layout* no renderiza la página.
      if (context.cmsAccess.status !== 'ok') {
        return;
      }

      await loadCmsTableForCreate(context.queryClient, params);
    },
    head: ({ params }) => ({
      meta: [{ title: `${params.schema}.${params.table}` }],
    }),
    component: RecordCreatePage,
    errorComponent: ({ reset }) => <CmsRecordError reset={reset} />,
  },
);

function RecordCreatePage() {
  const { schema, table } = Route.useParams();

  return <CmsRecordCreatePage schema={schema} table={table} />;
}
