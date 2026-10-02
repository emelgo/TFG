/**
 * *Search params* del listado de miembros (`/admin/cms/settings/members`).
 *
 * La página y la búsqueda viven en la URL, como en el resto del CMS:
 * cambiarlas es navegar, así que el historial, los enlaces y el SSR
 * funcionan igual. Un valor no válido escrito a mano se descarta con
 * `.catch` en lugar de romper la página.
 */
import * as z from 'zod';

import type { MembersListParams } from '@pymekit/cms-ui-core/settings-api';

export const MembersSearchSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
  search: z.string().trim().max(100).optional().catch(undefined),
});

export type MembersSearch = z.infer<typeof MembersSearchSchema>;

/** Traduce la URL a los parámetros de la API (sin valores vacíos). */
export function toMembersListParams(search: MembersSearch): MembersListParams {
  return {
    page: search.page && search.page > 1 ? search.page : undefined,
    search: search.search ? search.search : undefined,
  };
}

/** Nueva URL al buscar: vuelve siempre a la primera página. */
export function withMembersSearch(term: string): MembersSearch {
  const search = term.trim();

  return { search: search || undefined, page: undefined };
}
