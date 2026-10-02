/**
 * Rejilla de los paneles: posiciones, límites por tipo y colisiones (F2.8).
 *
 * El panel es una rejilla de 12 columnas (`DASHBOARD_GRID_COLUMNS`) con filas
 * de alto fijo. Cada *widget* ocupa un rectángulo `{ x, y, w, h }`. En el
 * modo «Organizar» se mueve y redimensiona con botones (accesibles con
 * teclado y fáciles de probar en E2E); estas funciones calculan la nueva
 * distribución:
 *
 *  - el *widget* movido se ajusta a la rejilla y a los tamaños de su tipo;
 *  - los que choquen con él se empujan hacia abajo, en cascada;
 *  - al guardar, solo se envían los que han cambiado (`getChangedPositions`).
 *
 * Decisión: no hay ninguna librería de rejilla en el catálogo de pnpm, así
 * que se evita añadir una dependencia y se resuelve con CSS Grid y estas
 * funciones puras (con tests en `__tests__`).
 *
 * [TFG] RF-11 · ADR-013.
 */
import {
  DASHBOARD_GRID_COLUMNS,
  DASHBOARD_MAX_WIDGET_HEIGHT,
  type WidgetPosition,
  type WidgetType,
} from '@pymekit/cms-shared/dashboards';

export type GridItem = WidgetPosition & { id: string; type: WidgetType };

/** Tamaños mínimo y máximo de cada tipo (los mismos que usa la API). */
export const WIDGET_SIZE_LIMITS: Record<
  WidgetType,
  { minW: number; minH: number; maxW: number; maxH: number }
> = {
  metric: { minW: 2, minH: 2, maxW: 6, maxH: 3 },
  chart: { minW: 3, minH: 2, maxW: 12, maxH: 8 },
  table: { minW: 4, minH: 3, maxW: 12, maxH: DASHBOARD_MAX_WIDGET_HEIGHT },
};

/** Tamaño con el que se crea un *widget* nuevo de cada tipo. */
export const DEFAULT_WIDGET_SIZE: Record<WidgetType, { w: number; h: number }> =
  {
    metric: { w: 3, h: 2 },
    chart: { w: 6, h: 4 },
    table: { w: 6, h: 4 },
  };

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * Normaliza una posición guardada (JSON de la base de datos): enteros, dentro
 * de la rejilla y respetando los límites del tipo. Si falta, se usa el
 * tamaño por defecto en la esquina superior izquierda.
 */
export function normalizePosition(
  raw: unknown,
  type: WidgetType,
): WidgetPosition {
  const limits = WIDGET_SIZE_LIMITS[type];
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const read = (key: string, fallback: number) => {
    const value = Number(source[key]);
    return Number.isFinite(value) ? Math.round(value) : fallback;
  };

  const w = clamp(
    read('w', DEFAULT_WIDGET_SIZE[type].w),
    limits.minW,
    limits.maxW,
  );
  const h = clamp(
    read('h', DEFAULT_WIDGET_SIZE[type].h),
    limits.minH,
    limits.maxH,
  );

  return {
    x: clamp(read('x', 0), 0, DASHBOARD_GRID_COLUMNS - w),
    y: Math.max(read('y', 0), 0),
    w,
    h,
  };
}

/** ¿Se solapan dos rectángulos de la rejilla? */
export function itemsOverlap(a: WidgetPosition, b: WidgetPosition) {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

/** Cambio relativo que piden los botones de «Organizar». */
export type LayoutChange = {
  dx?: number;
  dy?: number;
  dw?: number;
  dh?: number;
};

/**
 * Aplica un movimiento o cambio de tamaño a un *widget* y empuja hacia
 * abajo los que choquen con él (en cascada). Devuelve una lista nueva; la
 * original no se modifica.
 */
export function applyLayoutChange(
  items: GridItem[],
  id: string,
  change: LayoutChange,
): GridItem[] {
  const next = items.map((item) => ({ ...item }));
  const target = next.find((item) => item.id === id);

  if (!target) {
    return next;
  }

  const limits = WIDGET_SIZE_LIMITS[target.type];

  target.w = clamp(target.w + (change.dw ?? 0), limits.minW, limits.maxW);
  target.h = clamp(target.h + (change.dh ?? 0), limits.minH, limits.maxH);
  target.x = clamp(
    target.x + (change.dx ?? 0),
    0,
    DASHBOARD_GRID_COLUMNS - target.w,
  );
  // Si ya no cabe a la derecha tras ensanchar, se recorta el ancho.
  target.w = Math.min(target.w, DASHBOARD_GRID_COLUMNS - target.x);
  target.y = Math.max(target.y + (change.dy ?? 0), 0);

  // Cascada: cada widget desplazado puede chocar con otros. Como cada paso
  // solo empuja hacia abajo, termina; el límite evita bucles con datos raros.
  const queue: GridItem[] = [target];
  let guard = next.length * next.length + 1;

  while (queue.length > 0 && guard-- > 0) {
    const current = queue.shift()!;

    for (const other of next) {
      if (other.id !== current.id && other.id !== target.id) {
        if (itemsOverlap(current, other)) {
          other.y = current.y + current.h;
          queue.push(other);
        }
      }
    }
  }

  return next;
}

/** Posiciones que han cambiado entre dos distribuciones (para guardar). */
export function getChangedPositions(before: GridItem[], after: GridItem[]) {
  const previous = new Map(before.map((item) => [item.id, item]));

  return after
    .filter((item) => {
      const old = previous.get(item.id);

      return (
        !old ||
        old.x !== item.x ||
        old.y !== item.y ||
        old.w !== item.w ||
        old.h !== item.h
      );
    })
    .map((item) => ({
      id: item.id,
      position: { x: item.x, y: item.y, w: item.w, h: item.h },
    }));
}

/** Primera fila libre debajo de todos los *widgets* (para añadir uno nuevo). */
export function getNextFreeRow(items: WidgetPosition[]) {
  return items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
}
