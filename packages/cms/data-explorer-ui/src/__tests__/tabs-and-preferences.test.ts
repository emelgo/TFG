/**
 * Pruebas del almacén de pestañas, de las preferencias de columnas y de la
 * memoria de filtros por tabla (todas con almacenamiento simulado).
 */
import { describe, expect, it } from 'vitest';

import { MAX_TABS, TabsStore, parseStoredTabs } from '../store/tabs-store';
import {
  DEFAULT_COLUMN_PREFERENCES,
  moveColumn,
  parseColumnPreferences,
  toggleColumnPin,
  toggleColumnVisibility,
} from '../utils/column-preferences';
import {
  restoreFilterContext,
  saveFilterContext,
} from '../utils/filter-context';
import { getTabPathInfo } from '../utils/tab-paths';

function memoryStorage() {
  const data = new Map<string, string>();

  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe('TabsStore', () => {
  it('crea, actualiza y reutiliza pestañas según la ruta', () => {
    let id = 0;
    const store = new TabsStore(
      memoryStorage(),
      () => 1,
      () => `t${++id}`,
    );

    store.ensureTabForPath({ path: '/a', title: 'A' });
    store.ensureTabForPath({ path: '/a?x=1', title: 'A' });

    expect(store.getSnapshot().tabs).toHaveLength(1);
    expect(store.getSnapshot().activeTab?.path).toBe('/a?x=1');

    store.createTab({ title: 'B', path: '/b' });
    store.ensureTabForPath({ path: '/a?x=1', title: 'A' });

    expect(store.getSnapshot().activeTab?.id).toBe('t1');
  });

  it('cierra la pestaña usada hace más tiempo al superar el máximo', () => {
    let time = 0;
    let id = 0;
    const store = new TabsStore(
      memoryStorage(),
      () => ++time,
      () => `t${++id}`,
    );

    for (let i = 0; i <= MAX_TABS; i++) {
      store.createTab({ title: `T${i}`, path: `/t${i}` });
    }

    const tabs = store.getSnapshot().tabs;

    expect(tabs).toHaveLength(MAX_TABS);
    expect(tabs.some((tab) => tab.id === 't1')).toBe(false);
  });

  it('al cerrar la activa pasa a serlo la última', () => {
    let id = 0;
    const store = new TabsStore(
      memoryStorage(),
      () => 1,
      () => `t${++id}`,
    );

    store.createTab({ title: 'A', path: '/a' });
    store.createTab({ title: 'B', path: '/b' });
    store.closeTab('t2');

    expect(store.getSnapshot().activeTab?.id).toBe('t1');
  });

  it('persiste y descarta datos corruptos', () => {
    const storage = memoryStorage();
    new TabsStore(
      storage,
      () => 1,
      () => 'x',
    ).createTab({
      title: 'A',
      path: '/a',
    });

    expect(new TabsStore(storage).getSnapshot().tabs).toHaveLength(1);
    expect(parseStoredTabs('{no json')).toEqual([]);
    expect(
      parseStoredTabs(
        JSON.stringify([
          { id: '1', title: 'a', path: '/', isActive: true },
          { id: '2', title: 'b', path: '/', isActive: true },
          { id: 3 },
        ]),
      ).map((tab) => tab.isActive),
    ).toEqual([true, false]);
  });
});

describe('getTabPathInfo', () => {
  it('reconoce tablas y registros del explorador', () => {
    expect(
      getTabPathInfo('/admin/cms/resources/public/accounts?page=2'),
    ).toEqual({
      type: 'table',
      schema: 'public',
      table: 'accounts',
      title: 'public.accounts',
    });
    expect(
      getTabPathInfo('/admin/cms/resources/public/accounts/record/1', 'Cuentas')
        ?.type,
    ).toBe('record');
    expect(getTabPathInfo('/admin/cms')).toBeNull();
  });
});

describe('preferencias de columnas', () => {
  it('descarta columnas que ya no existen', () => {
    const raw = JSON.stringify({
      visibility: { a: false, zzz: false },
      pinning: { left: ['a', 'zzz'], right: [] },
      order: ['b', 'zzz', 'a'],
    });

    expect(parseColumnPreferences(raw, ['a', 'b'])).toEqual({
      visibility: { a: false },
      pinning: { left: ['a'], right: [] },
      order: ['b', 'a'],
      version: 1,
    });
    expect(parseColumnPreferences('{', ['a'])).toBe(DEFAULT_COLUMN_PREFERENCES);
  });

  it('alterna visibilidad y fijado', () => {
    const hidden = toggleColumnVisibility(DEFAULT_COLUMN_PREFERENCES, 'a');

    expect(hidden.visibility.a).toBe(false);
    expect(toggleColumnVisibility(hidden, 'a').visibility.a).toBe(true);

    const pinned = toggleColumnPin(DEFAULT_COLUMN_PREFERENCES, 'a');

    expect(pinned.pinning.left).toEqual(['a']);
    expect(toggleColumnPin(pinned, 'a').pinning.left).toEqual([]);
  });

  it('sube y baja columnas sin salirse de los extremos', () => {
    const prefs = DEFAULT_COLUMN_PREFERENCES;

    expect(moveColumn(prefs, ['a', 'b', 'c'], 'c', 'up').order).toEqual([
      'a',
      'c',
      'b',
    ]);
    expect(moveColumn(prefs, ['a', 'b'], 'a', 'up')).toBe(prefs);
  });
});

describe('memoria de filtros', () => {
  it('restaura una URL reciente solo si la actual está vacía', () => {
    const storage = memoryStorage();
    const search = { filters: { 'name.eq': 'x' } };

    saveFilterContext('public', 'accounts', search, storage, 1000);

    expect(
      restoreFilterContext('public', 'accounts', { page: 2 }, storage, 1000),
    ).toBeNull();
    expect(
      restoreFilterContext('public', 'accounts', {}, storage, 2000),
    ).toEqual(search);
    // Se consume al restaurarla.
    expect(restoreFilterContext('public', 'accounts', {}, storage)).toBeNull();
  });

  it('caduca a la hora y se borra al limpiar los filtros', () => {
    const storage = memoryStorage();

    saveFilterContext('s', 't', { search: 'a' }, storage, 0);
    expect(
      restoreFilterContext('s', 't', {}, storage, 2 * 60 * 60 * 1000),
    ).toBeNull();

    saveFilterContext('s', 't', { search: 'a' }, storage, 0);
    saveFilterContext('s', 't', {}, storage, 0);
    expect(restoreFilterContext('s', 't', {}, storage, 0)).toBeNull();
  });
});
