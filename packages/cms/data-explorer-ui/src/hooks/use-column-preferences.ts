/**
 * Preferencias de columnas de una tabla, guardadas en `localStorage`.
 *
 * Se leen con `useSyncExternalStore` y no en el estado inicial de un
 * `useState`: en el servidor no hay `localStorage` y, si el primer render del
 * navegador ya mostrara otras columnas, React detectaría una diferencia al
 * hidratar. Con la instantánea del servidor (`null` → valores por defecto) el
 * HTML coincide y justo después se aplican las preferencias guardadas.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import {
  type ColumnManagementState,
  sortTableColumns,
} from '@pymekit/cms-table/components';
import type { ColumnMetadata } from '@pymekit/cms-types';

import {
  type ColumnPreferences,
  DEFAULT_COLUMN_PREFERENCES,
  getColumnPinSide,
  getColumnPreferencesKey,
  moveColumn,
  parseColumnPreferences,
  toggleColumnPin,
  toggleColumnVisibility,
} from '../utils/column-preferences';

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);

  // Otra pestaña del navegador puede cambiar las mismas preferencias.
  window.addEventListener('storage', listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readItem(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeItem(key: string, value: string | null) {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Sin almacenamiento disponible las preferencias no se conservan, pero
    // la tabla sigue funcionando con los valores por defecto.
  }

  listeners.forEach((listener) => listener());
}

/**
 * Devuelve el estado de gestión de columnas (visibilidad, fijado y orden) de
 * una tabla y las acciones para cambiarlo.
 *
 * @param params.columns Metadato de las columnas de la tabla: sirve para
 *   descartar preferencias de columnas que ya no existen y para calcular el
 *   orden actual que usan «subir» y «bajar».
 */
export function useColumnPreferences(params: {
  schema: string;
  table: string;
  columns: ColumnMetadata[];
}): ColumnManagementState {
  const key = getColumnPreferencesKey(params.schema, params.table);

  const availableColumns = useMemo(
    () => params.columns.map((column) => column.name),
    [params.columns],
  );

  const raw = useSyncExternalStore(
    subscribe,
    () => readItem(key),
    () => null,
  );

  const preferences = useMemo(
    () => parseColumnPreferences(raw, availableColumns),
    [raw, availableColumns],
  );

  // Orden con el que se muestran ahora las columnas del listado.
  const currentOrder = useMemo(
    () =>
      sortTableColumns(
        params.columns.filter((column) => column.is_visible_in_table),
        preferences.order,
      ).map((column) => column.name),
    [params.columns, preferences.order],
  );

  const save = useCallback(
    (next: ColumnPreferences) => writeItem(key, JSON.stringify(next)),
    [key],
  );

  return useMemo(
    () => ({
      columnVisibility: preferences.visibility,
      columnPinning: preferences.pinning,
      columnOrder: preferences.order,
      toggleColumnVisibility: (columnId) =>
        save(toggleColumnVisibility(preferences, columnId)),
      toggleColumnPin: (columnId, side) =>
        save(toggleColumnPin(preferences, columnId, side)),
      isColumnPinned: (columnId) => getColumnPinSide(preferences, columnId),
      moveColumn: (columnId, direction) =>
        save(moveColumn(preferences, currentOrder, columnId, direction)),
      resetPreferences: () => save(DEFAULT_COLUMN_PREFERENCES),
    }),
    [preferences, save, currentOrder],
  );
}
