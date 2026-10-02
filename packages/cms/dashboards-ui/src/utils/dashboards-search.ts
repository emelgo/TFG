/**
 * *Search params* del listado de paneles (`/admin/cms/dashboards`).
 *
 * La URL es el estado del listado (página, búsqueda y filtro): se valida
 * con Zod en `validateSearch` y un valor no válido se descarta (`.catch`)
 * en lugar de romper la página.
 *
 * [TFG] RF-11 · ADR-013.
 */
import * as z from 'zod';

import type { DashboardsListParams } from '@pymekit/cms-ui-core/dashboards-api';

export const DASHBOARDS_PAGE_SIZE = 12;

export const DashboardsSearchSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
  search: z.string().trim().max(100).optional().catch(undefined),
  filter: z.enum(['all', 'owned', 'shared']).optional().catch(undefined),
});

export type DashboardsSearch = z.infer<typeof DashboardsSearchSchema>;

/** Parámetros de la API a partir de la URL. */
export function toDashboardsListParams(
  search: DashboardsSearch,
): DashboardsListParams {
  return {
    page: search.page ?? 1,
    pageSize: DASHBOARDS_PAGE_SIZE,
    search: search.search || undefined,
    filter: search.filter ?? 'all',
  };
}
