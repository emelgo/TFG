/**
 * Utilidades puras sobre los recursos (tablas) legibles del CMS.
 *
 * `GET /v1/navigation` devuelve una lista plana de tablas en el orden
 * configurado (`cms.table_metadata.ordering`). La portada del CMS las muestra
 * agrupadas por esquema de PostgreSQL, conservando ese orden, y oculta las
 * que se han marcado como no visibles en los ajustes. La barra lateral de la
 * consola usa la misma agrupación, con un límite de tablas.
 */

/** Forma mínima de un recurso que necesitan estas utilidades. */
export type ResourceLike = {
  schemaName: string;
  tableName: string;
  metadata: { isVisible: boolean | null };
};

/**
 * Devuelve solo los recursos visibles. `is_visible` es `true` por defecto en
 * la base de datos, así que un valor nulo cuenta como visible.
 */
export function getVisibleResources<T extends ResourceLike>(resources: T[]) {
  return resources.filter((resource) => resource.metadata.isVisible !== false);
}

/**
 * Agrupa los recursos visibles por esquema, respetando el orden de llegada
 * tanto de los esquemas (primera aparición) como de las tablas.
 */
export function groupResourcesBySchema<T extends ResourceLike>(resources: T[]) {
  const groups = new Map<string, T[]>();

  for (const resource of getVisibleResources(resources)) {
    const group = groups.get(resource.schemaName) ?? [];

    group.push(resource);
    groups.set(resource.schemaName, group);
  }

  return Array.from(groups, ([schemaName, items]) => ({ schemaName, items }));
}

/** Número máximo de tablas que se listan en la barra lateral. */
export const SIDEBAR_RESOURCES_LIMIT = 40;

/**
 * Prepara las tablas legibles para el grupo «Recursos» de la barra lateral
 * de la consola:
 *
 *  - agrupadas por esquema (con `groupResourcesBySchema`), y con el nombre
 *    del esquema visible solo si hay más de uno (con un único esquema la
 *    cabecera no aporta nada);
 *  - como mucho `limit` tablas en total, para que una base de datos con
 *    cientos de tablas no convierta la barra en una lista interminable. Las
 *    que no caben se cuentan en `hiddenCount` y se llega a ellas desde la
 *    portada del CMS, que las lista todas.
 *
 * Solo recibe lo que devuelve `GET /v1/navigation`, que ya está filtrado por
 * los permisos del RBAC del CMS: la barra nunca ofrece una tabla que el
 * usuario no pueda leer.
 */
export function getSidebarResourceGroups<T extends ResourceLike>(
  resources: T[],
  limit = SIDEBAR_RESOURCES_LIMIT,
) {
  const groups = groupResourcesBySchema(resources);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  let remaining = Math.max(0, limit);
  const limited: Array<{ schemaName: string; items: T[] }> = [];

  for (const group of groups) {
    if (remaining === 0) {
      break;
    }

    const items = group.items.slice(0, remaining);

    remaining -= items.length;
    limited.push({ schemaName: group.schemaName, items });
  }

  const shown = limited.reduce((sum, group) => sum + group.items.length, 0);

  return {
    groups: limited,
    showSchemaLabels: groups.length > 1,
    hiddenCount: total - shown,
  };
}

/**
 * Indica si la ruta actual pertenece a una tabla: su listado
 * (`/admin/cms/resources/<esquema>/<tabla>`) o cualquier subruta (ficha,
 * creación, edición). Compara segmentos completos, para que `orders` no
 * quede activa al ver `order_items`.
 */
export function isResourcePathActive(
  pathname: string,
  schemaName: string,
  tableName: string,
) {
  // `useLocation().pathname` ya llega decodificado: se compara con los
  // nombres tal cual (una tabla `categorías` no coincidiría si se
  // codificara aquí).
  const base = `/admin/cms/resources/${schemaName}/${tableName}`;
  const path = pathname.replace(/\/$/, '');

  return path === base || path.startsWith(`${base}/`);
}
