/**
 * Preferencias de columnas del listado: cuáles se ocultan, cuáles se fijan a
 * un lado y en qué orden se muestran.
 *
 * Son preferencias del usuario en este navegador (se guardan en
 * `localStorage`, una entrada por tabla), no configuración del recurso: la
 * configuración común (qué columnas existen en el listado y su orden por
 * defecto) está en `cms.table_metadata` y la editan los administradores.
 *
 * Aquí solo hay funciones puras sobre un objeto inmutable; el *hook*
 * `useColumnPreferences` se encarga de leerlas y guardarlas.
 */

export type ColumnPinning = { left: string[]; right: string[] };

export type ColumnPreferences = {
  /** `false` = columna oculta; si no aparece, está visible. */
  visibility: Record<string, boolean>;
  pinning: ColumnPinning;
  /** Orden elegido por el usuario (nombres de columna). */
  order: string[];
  version: 1;
};

export const DEFAULT_COLUMN_PREFERENCES: ColumnPreferences = {
  visibility: {},
  pinning: { left: [], right: [] },
  order: [],
  version: 1,
};

/** Clave de `localStorage` de las preferencias de una tabla. */
export function getColumnPreferencesKey(schema: string, table: string) {
  return `cms-data-explorer-columns:${schema}.${table}`;
}

/**
 * Interpreta las preferencias guardadas, descartando las columnas que ya no
 * existen en la tabla y cualquier valor mal formado.
 */
export function parseColumnPreferences(
  raw: string | null,
  availableColumns: string[],
): ColumnPreferences {
  if (!raw) {
    return DEFAULT_COLUMN_PREFERENCES;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ColumnPreferences>;
    const exists = (name: unknown): name is string =>
      typeof name === 'string' && availableColumns.includes(name);

    const visibility: Record<string, boolean> = {};

    for (const [name, visible] of Object.entries(parsed.visibility ?? {})) {
      if (exists(name) && typeof visible === 'boolean') {
        visibility[name] = visible;
      }
    }

    const list = (value: unknown) =>
      Array.isArray(value) ? value.filter(exists) : [];

    return {
      visibility,
      pinning: {
        left: list(parsed.pinning?.left),
        right: list(parsed.pinning?.right),
      },
      order: list(parsed.order),
      version: 1,
    };
  } catch {
    return DEFAULT_COLUMN_PREFERENCES;
  }
}

/** Muestra u oculta una columna. */
export function toggleColumnVisibility(
  prefs: ColumnPreferences,
  columnId: string,
): ColumnPreferences {
  return {
    ...prefs,
    visibility: {
      ...prefs.visibility,
      [columnId]: !(prefs.visibility[columnId] ?? true),
    },
  };
}

/** Lado al que está fijada una columna, o `false`. */
export function getColumnPinSide(prefs: ColumnPreferences, columnId: string) {
  if (prefs.pinning.left.includes(columnId)) {
    return 'left' as const;
  }

  if (prefs.pinning.right.includes(columnId)) {
    return 'right' as const;
  }

  return false as const;
}

/** Fija una columna al lado indicado o, si ya estaba fijada, la suelta. */
export function toggleColumnPin(
  prefs: ColumnPreferences,
  columnId: string,
  side: 'left' | 'right' = 'left',
): ColumnPreferences {
  const current = getColumnPinSide(prefs, columnId);

  if (current) {
    return {
      ...prefs,
      pinning: {
        ...prefs.pinning,
        [current]: prefs.pinning[current].filter((id) => id !== columnId),
      },
    };
  }

  return {
    ...prefs,
    pinning: {
      ...prefs.pinning,
      [side]: [...prefs.pinning[side], columnId],
    },
  };
}

/**
 * Sube o baja una columna una posición. `currentOrder` es el orden con el que
 * se está mostrando ahora (metadato + preferencias); el resultado se guarda
 * completo para que el orden sea estable aunque cambie el metadato.
 */
export function moveColumn(
  prefs: ColumnPreferences,
  currentOrder: string[],
  columnId: string,
  direction: 'up' | 'down',
): ColumnPreferences {
  const index = currentOrder.indexOf(columnId);
  const target = direction === 'up' ? index - 1 : index + 1;

  if (index === -1 || target < 0 || target >= currentOrder.length) {
    return prefs;
  }

  const order = [...currentOrder];

  [order[index], order[target]] = [order[target]!, order[index]!];

  return { ...prefs, order };
}
