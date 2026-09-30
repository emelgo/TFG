/**
 * *Search params* del listado de usuarios del CMS (`/admin/cms/users`).
 *
 * La página y la búsqueda viven en la URL, igual que en el explorador de
 * datos: cambiarlas es navegar, así que el historial, los enlaces
 * compartidos y el SSR funcionan igual. Un valor no válido (a mano en la URL)
 * se descarta con `.catch` en lugar de romper la página.
 */
import * as z from 'zod';

import type { UsersListParams } from '@pymekit/cms-ui-core/users-api';

export const UsersSearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  search: z.string().trim().max(255).optional().catch(undefined),
});

export type UsersSearch = z.infer<typeof UsersSearchSchema>;

/** Traduce la URL a los parámetros de la API (sin valores vacíos). */
export function toUsersListParams(search: UsersSearch): UsersListParams {
  return {
    page: search.page && search.page > 1 ? search.page : undefined,
    search: search.search ? search.search : undefined,
  };
}

/** Nueva URL al buscar: vuelve siempre a la primera página. */
export function withUsersSearch(term: string): UsersSearch {
  const search = term.trim();

  return { search: search || undefined, page: undefined };
}
