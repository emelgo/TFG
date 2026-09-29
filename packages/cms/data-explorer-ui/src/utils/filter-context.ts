/**
 * Memoria de los filtros de cada tabla durante la sesión del navegador.
 *
 * Caso de uso: el usuario filtra una tabla, abre un registro y vuelve a la
 * tabla desde la barra lateral o la portada (no con «atrás»). Sin esto
 * perdería los filtros. El listado guarda su URL en `sessionStorage` (por
 * pestaña del navegador y solo mientras está abierta) y, al volver a entrar
 * en la tabla sin parámetros, el `beforeLoad` de la ruta la restaura.
 *
 * Solo se restaura si la URL llega vacía (un enlace con filtros manda) y la
 * memoria caduca a la hora. Si el usuario limpia los filtros, la URL queda
 * vacía y la memoria se borra.
 */
import type { DataExplorerSearch } from './search-schema';

const STORAGE_KEY_PREFIX = 'cms-data-explorer-filters';
const CONTEXT_VERSION = 1;
const CONTEXT_EXPIRY_MS = 60 * 60 * 1000;

type StoredContext = {
  search: DataExplorerSearch;
  timestamp: number;
  version: number;
};

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getStorageKey(schema: string, table: string) {
  return `${STORAGE_KEY_PREFIX}:${schema}.${table}`;
}

function getSessionStorage(): SessionStorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Indica si la URL del listado no tiene ningún parámetro. */
export function isEmptySearch(search: DataExplorerSearch) {
  return Object.values(search).every(
    (value) =>
      value === undefined ||
      (typeof value === 'object' && Object.keys(value).length === 0),
  );
}

/** Guarda (o borra, si está vacía) la URL del listado de una tabla. */
export function saveFilterContext(
  schema: string,
  table: string,
  search: DataExplorerSearch,
  storage: SessionStorageLike | null = getSessionStorage(),
  now = Date.now(),
) {
  try {
    const key = getStorageKey(schema, table);

    if (isEmptySearch(search)) {
      storage?.removeItem(key);
      return;
    }

    const context: StoredContext = {
      search,
      timestamp: now,
      version: CONTEXT_VERSION,
    };

    storage?.setItem(key, JSON.stringify(context));
  } catch {
    // La memoria de filtros es una comodidad: si falla, no pasa nada.
  }
}

/**
 * Devuelve la URL guardada de la tabla si la actual está vacía y la memoria
 * es reciente, o `null`. La memoria se consume al restaurarla.
 */
export function restoreFilterContext(
  schema: string,
  table: string,
  currentSearch: DataExplorerSearch,
  storage: SessionStorageLike | null = getSessionStorage(),
  now = Date.now(),
): DataExplorerSearch | null {
  if (!storage || !isEmptySearch(currentSearch)) {
    return null;
  }

  try {
    const key = getStorageKey(schema, table);
    const raw = storage.getItem(key);

    if (!raw) {
      return null;
    }

    storage.removeItem(key);

    const context = JSON.parse(raw) as Partial<StoredContext>;

    const isValid =
      context.version === CONTEXT_VERSION &&
      typeof context.timestamp === 'number' &&
      now - context.timestamp < CONTEXT_EXPIRY_MS &&
      context.search &&
      typeof context.search === 'object' &&
      !isEmptySearch(context.search);

    return isValid ? (context.search as DataExplorerSearch) : null;
  } catch {
    return null;
  }
}
