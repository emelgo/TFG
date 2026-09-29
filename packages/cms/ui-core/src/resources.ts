/**
 * Utilidades puras sobre los recursos (tablas) legibles del CMS.
 *
 * `GET /v1/navigation` devuelve una lista plana de tablas en el orden
 * configurado (`cms.table_metadata.ordering`). La portada del CMS las muestra
 * agrupadas por esquema de PostgreSQL, conservando ese orden, y oculta las
 * que se han marcado como no visibles en los ajustes.
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
