/**
 * Pruebas del almacén de pestañas: persistencia, límite de pestañas y
 * asociación de la ruta actual a una pestaña.
 */
import { describe, expect, it } from 'vitest';

import {
  MAX_TABS,
  TABS_STORAGE_KEY,
  TabsStore,
  parseStoredTabs,
} from '../store/tabs-store';
import { getTabPathInfo } from '../utils/tab-paths';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));

  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

function createStore(storage = memoryStorage()) {
  let clock = 0;
  let id = 0;

  return new TabsStore(
    storage,
    () => ++clock,
    () => `tab-${++id}`,
  );
}

describe('parseStoredTabs', () => {
  it('descarta pestañas mal formadas y deja una sola activa', () => {
    const tabs = parseStoredTabs(
      JSON.stringify([
        { id: 'a', title: 'A', path: '/a', isActive: true },
        { id: 'b', title: 'B', path: '/b', isActive: true },
        { id: 'c', title: 3 },
      ]),
    );

    expect(tabs.map((tab) => [tab.id, tab.isActive])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });

  it('tolera contenido corrupto', () => {
    expect(parseStoredTabs('{no json')).toEqual([]);
  });
});

describe('TabsStore', () => {
  it('guarda las pestañas y las recupera en otra instancia', () => {
    const storage = memoryStorage();
    const store = createStore(storage);

    store.createTab({ title: 'Cuentas', path: '/x' });

    expect(storage.data.get(TABS_STORAGE_KEY)).toContain('Cuentas');
    expect(createStore(storage).getSnapshot().tabs).toHaveLength(1);
  });

  it('devuelve la misma instantánea mientras no hay cambios', () => {
    const store = createStore();

    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('cierra la pestaña menos usada al superar el máximo', () => {
    const store = createStore();

    for (let i = 0; i <= MAX_TABS; i++) {
      store.createTab({ title: `T${i}`, path: `/t${i}` });
    }

    const titles = store.getSnapshot().tabs.map((tab) => tab.title);

    expect(titles).toHaveLength(MAX_TABS);
    expect(titles).not.toContain('T0');
    expect(store.getSnapshot().activeTab?.title).toBe(`T${MAX_TABS}`);
  });

  it('al cerrar la activa, activa la última que queda', () => {
    const store = createStore();
    const first = store.createTab({ title: 'A', path: '/a' });

    store.createTab({ title: 'B', path: '/b' });
    store.activateTab(first);
    store.closeTab(first);

    expect(store.getSnapshot().activeTab?.title).toBe('B');
  });

  it('rellena la pestaña vacía activa antes que crear otra', () => {
    const store = createStore();

    store.createTab({ title: 'Nueva', path: '/admin/cms', isEmpty: true });
    store.ensureTabForPath({ title: 'Cuentas', path: '/c' });

    const { tabs } = store.getSnapshot();

    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ title: 'Cuentas', isEmpty: false });
  });

  it('activa una pestaña existente con la misma ruta', () => {
    const store = createStore();

    store.createTab({ title: 'A', path: '/a' });
    store.createTab({ title: 'B', path: '/b' });
    store.ensureTabForPath({ title: 'A', path: '/a' });

    expect(store.getSnapshot().activeTab?.path).toBe('/a');
    expect(store.getSnapshot().tabs).toHaveLength(2);
  });

  it('funciona en memoria si no hay almacenamiento', () => {
    const store = new TabsStore(null);

    store.createTab({ title: 'A', path: '/a' });

    expect(store.getSnapshot().tabs).toHaveLength(1);
  });
});

describe('getTabPathInfo', () => {
  it('reconoce el listado y la ficha de una tabla', () => {
    expect(
      getTabPathInfo('/admin/cms/resources/public/accounts?page=2', 'Cuentas'),
    ).toEqual({
      type: 'table',
      schema: 'public',
      table: 'accounts',
      title: 'Cuentas',
    });

    expect(
      getTabPathInfo('/admin/cms/resources/public/accounts/record/1'),
    ).toMatchObject({ type: 'record', title: 'public.accounts' });
  });

  it('ignora las rutas que no son de una tabla', () => {
    expect(getTabPathInfo('/admin/cms')).toBeNull();
    expect(getTabPathInfo('/admin/cms/resources/public')).toBeNull();
  });
});
