/**
 * Utilidades puras sobre los recursos (tablas) legibles del CMS.
 *
 * `GET /v1/navigation` devuelve una lista plana de tablas, ya filtrada por
 * los permisos del RBAC del CMS (las políticas RLS de `cms.table_metadata`
 * solo dejan ver las tablas que el usuario puede leer). La consola las
 * muestra **agrupadas por área de negocio** («Blog», «Cuentas»,
 * «Facturación»…), no por esquema de PostgreSQL: quien administra la web
 * de una pyme piensa en «las entradas del blog», no en `public.blog_posts`.
 *
 * El área es un dato del CMS: `cms.table_metadata.ui_config.navigation_group`
 * (texto libre, editable en Ajustes → Recursos). Las tablas sin área van a
 * un grupo final («Otros datos», texto de la interfaz, no dato). La misma
 * agrupación la usan la barra lateral, la vista «Todas las tablas», Ajustes
 * → Recursos y el selector de tablas de los paneles.
 *
 * [TFG] RF-09 · ADR-020.
 */

/** Longitud máxima del nombre de un área (la misma que valida la API). */
export const NAVIGATION_GROUP_MAX_LENGTH = 60;

/** Forma mínima de un recurso que necesitan estas utilidades. */
export type ResourceLike = {
  schemaName: string;
  tableName: string;
  displayName?: string | null;
  metadata: {
    isVisible: boolean | null;
    ordering?: number | null;
    uiConfig?: unknown;
  };
};

/**
 * Devuelve solo los recursos visibles. `is_visible` es `true` por defecto en
 * la base de datos, así que un valor nulo cuenta como visible.
 */
export function getVisibleResources<T extends ResourceLike>(resources: T[]) {
  return resources.filter((resource) => resource.metadata.isVisible !== false);
}

/**
 * Normaliza el nombre de un área: texto recortado y no vacío, o `null`
 * (sin área). `ui_config` es JSON libre, así que cualquier otro tipo de
 * valor se trata como «sin área» en lugar de romper la interfaz.
 */
export function normalizeNavigationGroup(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

/** Área de un recurso, leída de `metadata.uiConfig.navigation_group`. */
export function getResourceArea(resource: ResourceLike) {
  const uiConfig = resource.metadata.uiConfig;

  if (!uiConfig || typeof uiConfig !== 'object') {
    return null;
  }

  return normalizeNavigationGroup(
    (uiConfig as Record<string, unknown>).navigation_group,
  );
}

/**
 * Grupo de tablas de un área. `name` es `null` para el grupo «Otros datos»
 * (tablas sin área), que la interfaz rotula con un texto traducido.
 */
export type AreaGroup<T> = { name: string | null; items: T[] };

/** Cómo leer área, orden y nombre visible de un elemento cualquiera. */
export type AreaAccessors<T> = {
  area: (item: T) => string | null;
  ordering: (item: T) => number | null | undefined;
  label: (item: T) => string;
};

const collator = new Intl.Collator('es', { sensitivity: 'base' });

/** `ordering` nulo va al final. */
function orderOf(value: number | null | undefined) {
  return value ?? Number.POSITIVE_INFINITY;
}

function compareOrdering(a: number, b: number) {
  return a === b ? 0 : a < b ? -1 : 1;
}

/**
 * Agrupa elementos por área (función genérica, la usan también Ajustes y
 * los paneles con sus propios tipos de fila):
 *
 *  - las áreas se ordenan por el menor `ordering` de sus tablas y, a
 *    igualdad, por nombre (comparación en español, sin distinguir
 *    mayúsculas ni tildes); «Otros datos» (`name: null`) siempre va al final;
 *  - dentro de cada área, por `ordering` (los nulos al final) y después por
 *    nombre visible.
 */
export function groupByArea<T>(items: T[], accessors: AreaAccessors<T>) {
  const groups = new Map<string | null, T[]>();

  for (const item of items) {
    const name = accessors.area(item);
    const list = groups.get(name) ?? [];

    list.push(item);
    groups.set(name, list);
  }

  const result = Array.from(groups, ([name, list]) => {
    const sorted = [...list].sort(
      (a, b) =>
        compareOrdering(
          orderOf(accessors.ordering(a)),
          orderOf(accessors.ordering(b)),
        ) || collator.compare(accessors.label(a), accessors.label(b)),
    );

    return {
      name,
      items: sorted,
      minOrdering: orderOf(accessors.ordering(sorted[0]!)),
    };
  });

  result.sort((a, b) => {
    if (a.name === null || b.name === null) {
      return a.name === b.name ? 0 : a.name === null ? 1 : -1;
    }

    return (
      compareOrdering(a.minOrdering, b.minOrdering) ||
      collator.compare(a.name, b.name)
    );
  });

  return result.map(({ name, items }): AreaGroup<T> => ({ name, items }));
}

/** Nombre visible de un recurso, con el nombre técnico como respaldo. */
export function getResourceLabel(resource: ResourceLike) {
  return resource.displayName || resource.tableName;
}

/**
 * Agrupa por área los recursos **visibles** de `GET /v1/navigation`. Como
 * la lista ya llega filtrada por permisos, un área sin tablas legibles no
 * aparece: el personal de soporte solo ve las áreas de sus tablas.
 */
export function groupResourcesByArea<T extends ResourceLike>(resources: T[]) {
  return groupByArea(getVisibleResources(resources), {
    area: getResourceArea,
    ordering: (resource) => resource.metadata.ordering,
    label: getResourceLabel,
  });
}

/**
 * Nombres de las áreas que ya existen, ordenados alfabéticamente y sin
 * repetir. Sirven de sugerencias al editar el área de una tabla.
 */
export function getAreaNames(values: Array<string | null | undefined>) {
  const names = new Set<string>();

  for (const value of values) {
    const name = normalizeNavigationGroup(value);

    if (name) {
      names.add(name);
    }
  }

  return [...names].sort(collator.compare);
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
