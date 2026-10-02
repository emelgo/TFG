/**
 * Tests de las utilidades puras de la interfaz de paneles (F2.8, RF-11):
 * rejilla, formulario del editor, datos de los gráficos, errores y URL.
 */
import { describe, expect, it } from 'vitest';

import {
  formatBucketLabel,
  getMetricValue,
  toChartPoints,
} from '../utils/chart-data';
import {
  getDashboardErrorKey,
  isWidgetNoAccessError,
} from '../utils/dashboard-errors';
import {
  DashboardsSearchSchema,
  toDashboardsListParams,
} from '../utils/dashboards-search';
import {
  type GridItem,
  applyLayoutChange,
  getChangedPositions,
  getNextFreeRow,
  itemsOverlap,
  normalizePosition,
} from '../utils/grid-layout';
import {
  getDefaultWidgetFormValues,
  splitTableKey,
  toWidgetDefinition,
  widgetToFormValues,
} from '../utils/widget-form';

const item = (id: string, x: number, y: number, w = 3, h = 2): GridItem => ({
  id,
  type: 'chart',
  x,
  y,
  w,
  h,
});

describe('normalizePosition', () => {
  it('ajusta a la rejilla y a los límites del tipo', () => {
    expect(normalizePosition({ x: 11, y: -3, w: 1, h: 9 }, 'metric')).toEqual({
      x: 10,
      y: 0,
      w: 2,
      h: 3,
    });
  });

  it('usa el tamaño por defecto si falta la posición', () => {
    expect(normalizePosition(null, 'chart')).toEqual({
      x: 0,
      y: 0,
      w: 6,
      h: 4,
    });
  });
});

describe('applyLayoutChange', () => {
  it('mueve sin salirse de la rejilla', () => {
    const [moved] = applyLayoutChange([item('a', 9, 0)], 'a', { dx: 5 });
    expect(moved).toMatchObject({ x: 9 });
  });

  it('empuja hacia abajo en cascada lo que choca', () => {
    const layout = [item('a', 0, 0), item('b', 3, 0), item('c', 3, 2)];
    const next = applyLayoutChange(layout, 'a', { dx: 2 });

    expect(next.find((i) => i.id === 'a')).toMatchObject({ x: 2, y: 0 });
    expect(next.find((i) => i.id === 'b')).toMatchObject({ y: 2 });
    expect(next.find((i) => i.id === 'c')).toMatchObject({ y: 4 });

    for (const a of next) {
      for (const b of next) {
        if (a.id !== b.id) expect(itemsOverlap(a, b)).toBe(false);
      }
    }
  });

  it('respeta el tamaño mínimo y no modifica la lista original', () => {
    const layout = [item('a', 0, 0)];
    const [resized] = applyLayoutChange(layout, 'a', { dw: -5, dh: -5 });

    expect(resized).toMatchObject({ w: 3, h: 2 });
    expect(layout[0]).toMatchObject({ x: 0, w: 3 });
  });
});

describe('getChangedPositions / getNextFreeRow', () => {
  it('solo devuelve lo que ha cambiado', () => {
    const before = [item('a', 0, 0), item('b', 3, 0)];
    const after = applyLayoutChange(before, 'a', { dy: 1 });

    expect(getChangedPositions(before, after)).toEqual([
      { id: 'a', position: { x: 0, y: 1, w: 3, h: 2 } },
    ]);
    expect(getNextFreeRow(after)).toBe(3);
    expect(getNextFreeRow([])).toBe(0);
  });
});

describe('toWidgetDefinition', () => {
  it('construye una métrica de recuento válida', () => {
    const values = {
      ...getDefaultWidgetFormValues(),
      title: ' Orders ',
      table: 'demo.orders',
    };

    expect(toWidgetDefinition(values)).toEqual({
      widgetType: 'metric',
      title: 'Orders',
      schemaName: 'demo',
      tableName: 'orders',
      config: { aggregation: 'COUNT', metric: '*' },
    });
  });

  it('incluye la agrupación por fecha y el filtro de un gráfico', () => {
    const definition = toWidgetDefinition({
      ...getDefaultWidgetFormValues(),
      title: 'By month',
      widgetType: 'chart',
      table: 'demo.orders',
      xAxis: 'created_at',
      timeBucket: 'month',
      filterColumn: 'status',
      filterOperator: 'isNull',
      filterValue: 'ignored',
    });

    expect(definition?.config).toEqual({
      chartType: 'bar',
      xAxis: 'created_at',
      yAxis: '*',
      aggregation: 'COUNT',
      timeAggregation: 'month',
      filters: [{ column: 'status', operator: 'isNull', value: null }],
    });
  });

  it('rechaza lo que la API no aceptaría', () => {
    const base = { ...getDefaultWidgetFormValues(), title: 'x' };

    expect(toWidgetDefinition({ ...base, table: '' })).toBeNull();
    expect(
      toWidgetDefinition({ ...base, table: 'demo.orders', aggregation: 'SUM' }),
    ).toBeNull();
    expect(
      toWidgetDefinition({
        ...base,
        table: 'demo.orders',
        widgetType: 'table',
      }),
    ).toBeNull();
  });

  it('ida y vuelta: widget guardado → formulario → definición', () => {
    const stored = {
      widgetType: 'table' as const,
      title: 'Latest',
      schemaName: 'demo',
      tableName: 'orders',
      config: {
        columns: ['id', 'total'],
        filters: [{ column: 'total', operator: 'gt', value: 10 }],
      },
    };

    expect(toWidgetDefinition(widgetToFormValues(stored))).toEqual({
      ...stored,
      config: {
        columns: ['id', 'total'],
        filters: [{ column: 'total', operator: 'gt', value: '10' }],
      },
    });
  });

  it('separa esquema y tabla', () => {
    expect(splitTableKey('demo.orders')).toEqual({
      schemaName: 'demo',
      tableName: 'orders',
    });
    expect(splitTableKey('orders')).toBeNull();
  });
});

describe('chart-data', () => {
  it('lee el valor de una métrica', () => {
    expect(getMetricValue([{ value: '42' }])).toBe(42);
    expect(getMetricValue([])).toBeNull();
  });

  it('ordena por fecha y formatea las etiquetas por unidad', () => {
    const points = toChartPoints(
      [
        { time_bucket: '2026-03-01T00:00:00Z', value: 2 },
        { time_bucket: '2026-01-01T00:00:00Z', value: '5' },
      ],
      { xAxis: 'created_at', timeAggregation: 'month' },
    );

    expect(points).toEqual([
      { label: '2026-01', value: 5 },
      { label: '2026-03', value: 2 },
    ]);
    expect(formatBucketLabel('2026-05-04T10:00:00Z', 'year')).toBe('2026');
  });

  it('usa el eje X y marca los nulos', () => {
    expect(
      toChartPoints([{ status: null, value: 1 }], { xAxis: 'status' }),
    ).toEqual([{ label: '—', value: 1 }]);
  });
});

describe('dashboard-errors', () => {
  it('traduce códigos estables y 403 sin código', () => {
    expect(
      getDashboardErrorKey({ errorCode: 'DASHBOARD_FORBIDDEN' }, 'x'),
    ).toBe('errors.forbidden');
    expect(getDashboardErrorKey({ status: 403 }, 'x')).toBe('errors.forbidden');
    expect(getDashboardErrorKey(new Error('boom'), 'errors.saveFailed')).toBe(
      'errors.saveFailed',
    );
    expect(
      isWidgetNoAccessError({ errorCode: 'DASHBOARD_WIDGET_NO_ACCESS' }),
    ).toBe(true);
  });
});

describe('DashboardsSearchSchema', () => {
  it('descarta valores no válidos y traduce a parámetros', () => {
    const search = DashboardsSearchSchema.parse({
      page: 'abc',
      filter: 'mine',
      search: 'sales',
    });

    expect(search).toEqual({
      page: undefined,
      filter: undefined,
      search: 'sales',
    });
    expect(toDashboardsListParams(search)).toMatchObject({
      page: 1,
      filter: 'all',
      search: 'sales',
    });
  });
});
