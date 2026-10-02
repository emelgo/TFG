/**
 * Almacén de las pestañas del explorador de datos.
 *
 * Las pestañas permiten tener abiertas varias tablas (cada una con sus
 * filtros) y saltar entre ellas como en un navegador. Son una preferencia de
 * interfaz del propio usuario en este navegador, así que se guardan en
 * `localStorage` y no en la base de datos.
 *
 * Es un almacén externo a React (patrón `useSyncExternalStore`): los
 * componentes se suscriben y reciben una instantánea inmutable en cada
 * cambio. Dos detalles importan en una web con SSR:
 *
 *  - El almacenamiento se inyecta (`TabsStorage`) y solo se lee al crear el
 *    almacén en el navegador; en el servidor no existe `localStorage`.
 *  - Como máximo hay `MAX_TABS` pestañas: al abrir una más se cierra la que
 *    lleva más tiempo sin usarse (LRU).
 */

export interface DataExplorerTab {
  id: string;
  title: string;
  /** Ruta completa, con sus *search params* (filtros incluidos). */
  path: string;
  schema?: string;
  table?: string;
  isActive: boolean;
  /** Pestaña nueva a la espera de que el usuario elija una tabla. */
  isEmpty?: boolean;
  /** Último uso, para decidir qué pestaña cerrar al superar el máximo. */
  lastAccessed?: number;
}

/** Subconjunto de `Storage` que necesita el almacén (facilita las pruebas). */
export type TabsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type TabsSnapshot = {
  tabs: DataExplorerTab[];
  activeTab: DataExplorerTab | null;
};

export const TABS_STORAGE_KEY = 'cms-data-explorer-tabs';
export const MAX_TABS = 8;

/** Instantánea vacía compartida (la que ve el servidor durante el SSR). */
export const EMPTY_TABS_SNAPSHOT: TabsSnapshot = { tabs: [], activeTab: null };

function isValidTab(tab: unknown): tab is DataExplorerTab {
  if (!tab || typeof tab !== 'object') {
    return false;
  }

  const t = tab as Record<string, unknown>;

  return (
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    typeof t.path === 'string' &&
    typeof t.isActive === 'boolean' &&
    (t.schema === undefined || typeof t.schema === 'string') &&
    (t.table === undefined || typeof t.table === 'string') &&
    (t.isEmpty === undefined || typeof t.isEmpty === 'boolean') &&
    (t.lastAccessed === undefined || typeof t.lastAccessed === 'number')
  );
}

/**
 * Lee las pestañas guardadas descartando las mal formadas y dejando como
 * mucho una activa. Si el contenido está corrupto, se borra.
 */
export function parseStoredTabs(raw: string | null): DataExplorerTab[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    let hasActive = false;

    return parsed.filter(isValidTab).map((tab) => {
      if (tab.isActive && hasActive) {
        return { ...tab, isActive: false };
      }

      hasActive = hasActive || tab.isActive;

      return tab;
    });
  } catch {
    return [];
  }
}

export class TabsStore {
  private tabs: DataExplorerTab[];
  private listeners = new Set<() => void>();
  private snapshot: TabsSnapshot | null = null;

  constructor(
    private readonly storage: TabsStorage | null,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = () =>
      `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
  ) {
    this.tabs = parseStoredTabs(this.safeRead());
  }

  private safeRead() {
    try {
      return this.storage?.getItem(TABS_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private persist() {
    try {
      this.storage?.setItem(TABS_STORAGE_KEY, JSON.stringify(this.tabs));
    } catch {
      // Sin almacenamiento disponible (modo privado, cuota llena…) las
      // pestañas siguen funcionando en memoria durante la sesión.
    }
  }

  private commit(tabs: DataExplorerTab[]) {
    this.tabs = tabs;
    this.snapshot = null;
    this.persist();
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Devuelve la instantánea actual. Se cachea hasta el siguiente cambio:
   * `useSyncExternalStore` exige que dos lecturas seguidas sin cambios
   * devuelvan el mismo objeto, o entraría en un bucle de renderizado.
   */
  getSnapshot = (): TabsSnapshot => {
    if (!this.snapshot) {
      this.snapshot = {
        tabs: this.tabs,
        activeTab: this.tabs.find((tab) => tab.isActive) ?? null,
      };
    }

    return this.snapshot;
  };

  createTab(params: {
    title: string;
    path: string;
    schema?: string;
    table?: string;
    isEmpty?: boolean;
  }) {
    const now = this.now();
    const id = this.createId();

    let tabs = [
      ...this.tabs.map((tab) => ({
        ...tab,
        isActive: false,
        lastAccessed: tab.isActive ? now : (tab.lastAccessed ?? now),
      })),
      { ...params, id, isActive: true, lastAccessed: now },
    ];

    if (tabs.length > MAX_TABS) {
      const oldest = tabs
        .filter((tab) => !tab.isActive)
        .sort((a, b) => (a.lastAccessed ?? 0) - (b.lastAccessed ?? 0))[0];

      tabs = oldest
        ? tabs.filter((tab) => tab.id !== oldest.id)
        : tabs.slice(1);
    }

    this.commit(tabs);

    return id;
  }

  updateActiveTab(params: {
    title: string;
    path: string;
    schema?: string;
    table?: string;
  }) {
    const active = this.tabs.find((tab) => tab.isActive);

    if (!active) {
      return;
    }

    const changed =
      active.title !== params.title ||
      active.path !== params.path ||
      active.schema !== params.schema ||
      active.table !== params.table ||
      active.isEmpty;

    if (!changed) {
      return;
    }

    const now = this.now();

    this.commit(
      this.tabs.map((tab) =>
        tab.isActive
          ? { ...tab, ...params, isEmpty: false, lastAccessed: now }
          : tab,
      ),
    );
  }

  activateTab(tabId: string) {
    const now = this.now();

    this.commit(
      this.tabs.map((tab) => ({
        ...tab,
        isActive: tab.id === tabId,
        lastAccessed: tab.id === tabId ? now : tab.lastAccessed,
      })),
    );
  }

  /** Cierra una pestaña; si era la activa, pasa a serlo la última. */
  closeTab(tabId: string) {
    const closing = this.tabs.find((tab) => tab.id === tabId);
    let tabs = this.tabs.filter((tab) => tab.id !== tabId);

    if (closing?.isActive && tabs.length > 0) {
      const lastId = tabs[tabs.length - 1]!.id;

      tabs = tabs.map((tab) => ({ ...tab, isActive: tab.id === lastId }));
    }

    this.commit(tabs);
  }

  findTabByPath(path: string) {
    return this.tabs.find((tab) => tab.path === path);
  }

  /**
   * Asocia la ruta actual a una pestaña, con este orden de preferencia:
   *
   *  1. rellenar la pestaña activa si está vacía;
   *  2. activar una pestaña que ya tenga exactamente esta ruta;
   *  3. actualizar la pestaña activa (navegar dentro de ella);
   *  4. crear una pestaña si no hay ninguna.
   */
  ensureTabForPath(params: {
    path: string;
    title: string;
    schema?: string;
    table?: string;
  }) {
    const { activeTab } = this.getSnapshot();

    if (activeTab?.isEmpty) {
      this.updateActiveTab(params);
      return;
    }

    const exactMatch = this.findTabByPath(params.path);

    if (exactMatch) {
      if (!exactMatch.isActive) {
        this.activateTab(exactMatch.id);
      }

      if (exactMatch.title !== params.title) {
        this.updateActiveTab(params);
      }

      return;
    }

    if (activeTab) {
      this.updateActiveTab(params);
      return;
    }

    this.createTab(params);
  }
}

let browserStore: TabsStore | null = null;

/**
 * Devuelve el almacén de pestañas del navegador (se crea la primera vez) o
 * `null` en el servidor, donde no hay pestañas que mostrar.
 */
export function getTabsStore() {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!browserStore) {
    let storage: TabsStorage | null = null;

    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }

    browserStore = new TabsStore(storage);
  }

  return browserStore;
}
