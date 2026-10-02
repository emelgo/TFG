/**
 * Tests de las reglas compartidas de los paneles (F2.8, RF-11): la
 * definición estricta de los *widgets* y las columnas que usa cada uno.
 */
import { describe, expect, it } from 'vitest';

import {
  WidgetDefinitionSchema,
  WidgetPositionSchema,
  collectWidgetColumns,
} from '../utils/dashboards';

const metric = {
  widgetType: 'metric',
  title: 'Orders',
  schemaName: 'demo',
  tableName: 'orders',
  config: { aggregation: 'COUNT', metric: '*' },
} as const;

describe('WidgetDefinitionSchema', () => {
  it('acepta una métrica de recuento', () => {
    expect(WidgetDefinitionSchema.safeParse(metric).success).toBe(true);
  });

  it('rechaza campos desconocidos (sin SQL libre)', () => {
    const result = WidgetDefinitionSchema.safeParse({
      ...metric,
      config: { ...metric.config, sql: 'select 1' },
    });

    expect(result.success).toBe(false);
  });

  it('rechaza identificadores con comillas o espacios', () => {
    expect(
      WidgetDefinitionSchema.safeParse({
        ...metric,
        config: { aggregation: 'SUM', metric: 'total"; drop' },
      }).success,
    ).toBe(false);
    expect(
      WidgetDefinitionSchema.safeParse({ ...metric, tableName: 'a b' }).success,
    ).toBe(false);
  });

  it('solo COUNT puede agregar todas las filas (*)', () => {
    expect(
      WidgetDefinitionSchema.safeParse({
        ...metric,
        config: { aggregation: 'SUM', metric: '*' },
      }).success,
    ).toBe(false);
  });

  it('rechaza agregaciones y operadores fuera de la lista', () => {
    expect(
      WidgetDefinitionSchema.safeParse({
        ...metric,
        config: { aggregation: 'STRING_AGG', metric: '*' },
      }).success,
    ).toBe(false);
    expect(
      WidgetDefinitionSchema.safeParse({
        ...metric,
        config: {
          ...metric.config,
          filters: [{ column: 'status', operator: 'raw', value: '1' }],
        },
      }).success,
    ).toBe(false);
  });

  it('limita el número de filtros y de columnas', () => {
    const filters = Array.from({ length: 11 }, () => ({
      column: 'status',
      operator: 'eq',
      value: 'paid',
    }));

    expect(
      WidgetDefinitionSchema.safeParse({
        ...metric,
        config: { ...metric.config, filters },
      }).success,
    ).toBe(false);
    expect(
      WidgetDefinitionSchema.safeParse({
        widgetType: 'table',
        title: 'T',
        schemaName: 'demo',
        tableName: 'orders',
        config: { columns: ['id', 'id'] },
      }).success,
    ).toBe(false);
  });
});

describe('WidgetPositionSchema', () => {
  it('exige que el widget quepa en la rejilla', () => {
    expect(
      WidgetPositionSchema.safeParse({ x: 8, y: 0, w: 4, h: 2 }).success,
    ).toBe(true);
    expect(
      WidgetPositionSchema.safeParse({ x: 9, y: 0, w: 4, h: 2 }).success,
    ).toBe(false);
    expect(
      WidgetPositionSchema.safeParse({ x: 0.5, y: 0, w: 4, h: 2 }).success,
    ).toBe(false);
  });
});

describe('collectWidgetColumns', () => {
  it('reúne ejes, columnas, orden y filtros sin * ni repetidos', () => {
    expect(
      collectWidgetColumns({
        widgetType: 'chart',
        title: 'C',
        schemaName: 'demo',
        tableName: 'orders',
        config: {
          chartType: 'bar',
          xAxis: 'status',
          yAxis: '*',
          aggregation: 'COUNT',
          filters: [{ column: 'status', operator: 'neq', value: 'x' }],
        },
      }),
    ).toEqual(['status']);

    expect(
      collectWidgetColumns({
        widgetType: 'table',
        title: 'T',
        schemaName: 'demo',
        tableName: 'orders',
        config: { columns: ['id', 'total'], sortBy: 'created_at' },
      }),
    ).toEqual(['id', 'total', 'created_at']);
  });
});
