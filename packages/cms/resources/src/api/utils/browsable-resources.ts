/**
 * Filtro de las tablas que se pueden recorrer desde la interfaz del CMS.
 *
 * `cms.table_metadata` también registra tablas de esquemas protegidos, como
 * `auth.users`: sus metadatos sirven para mostrar las relaciones que apuntan
 * a ellas (el autor de una entrada, el usuario de una membresía…). Pero el
 * explorador genérico nunca abre esos esquemas (`isProtectedSchema`), así que
 * ofrecerlas en la navegación solo llevaba a «no encontrado».
 *
 * Este es el único punto que decide qué tablas se ofrecen: lo aplican
 * `GET /v1/navigation` y `GET /v1/resources`, de los que leen la barra
 * lateral, el menú móvil, «Todas las tablas», el selector de tabla de los
 * paneles, las secciones relacionadas de una ficha y el autocompletado de
 * los filtros. Se hace en el servidor, y no en la agrupación del cliente,
 * para que ninguna pantalla nueva pueda olvidarlo. La protección real sigue
 * en la API del explorador; esto solo evita enlaces que no llevan a nada.
 *
 * [TFG] RF-09 · RNF-02.
 */
import { isProtectedSchema } from '@pymekit/cms-data-explorer-core/protected-schemas';

/**
 * Quita de una lista de recursos los que pertenecen a un esquema protegido.
 *
 * @param resources Recursos con su `schemaName`.
 * @returns Los recursos que el explorador genérico puede abrir, en el mismo
 *   orden.
 */
export function excludeProtectedResources<T extends { schemaName: string }>(
  resources: T[],
): T[] {
  return resources.filter(
    (resource) => !isProtectedSchema(resource.schemaName),
  );
}
