/**
 * *Hooks* de React sobre el almacén de pestañas del explorador.
 *
 * `useDataExplorerTabs` se suscribe al almacén con `useSyncExternalStore`. En
 * el servidor (y durante la hidratación) devuelve una lista vacía: las
 * pestañas dependen de `localStorage`, que solo existe en el navegador, y así
 * el HTML del SSR coincide con el primer render del cliente. Justo después
 * React vuelve a renderizar con las pestañas reales.
 */
import { useEffect, useSyncExternalStore } from 'react';

import { useLocation } from '@tanstack/react-router';

import {
  EMPTY_TABS_SNAPSHOT,
  type TabsSnapshot,
  getTabsStore,
} from '../store/tabs-store';
import { getTabPathInfo } from '../utils/tab-paths';

const noopSubscribe = () => () => undefined;
const getEmptySnapshot = (): TabsSnapshot => EMPTY_TABS_SNAPSHOT;

/** Pestañas abiertas y la activa (vacías en el servidor). */
export function useDataExplorerTabs() {
  const store = getTabsStore();

  const snapshot = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getSnapshot ?? getEmptySnapshot,
    getEmptySnapshot,
  );

  return { ...snapshot, store };
}

/**
 * Asocia la tabla que se está viendo a una pestaña (la crea, la activa o
 * actualiza su ruta al cambiar los filtros).
 *
 * El `useEffect` está justificado: sincroniza un almacén externo
 * (`localStorage`) con la navegación, algo que no puede hacerse durante el
 * render ni en el `loader` (que también se ejecuta en el servidor).
 */
export function useTableTabManagement(displayName?: string | null) {
  const location = useLocation();
  const fullPath = location.href;

  useEffect(() => {
    const store = getTabsStore();
    const info = getTabPathInfo(fullPath, displayName);

    if (store && info) {
      store.ensureTabForPath({
        path: fullPath,
        title: info.title,
        schema: info.schema,
        table: info.table,
      });
    }
  }, [fullPath, displayName]);
}
