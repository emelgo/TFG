/**
 * Reglas compartidas de los paneles del CMS (F2.8): esquemas Zod estrictos
 * de los *widgets* y de su posición en la rejilla.
 *
 * Las usan a la vez la API (`@pymekit/cms-dashboards`, que valida cada
 * petición) y la interfaz (`@pymekit/cms-dashboards-ui`, que construye el
 * formulario del editor), así que lo que el editor permite es exactamente lo
 * que la API acepta. Es un módulo puro (solo Zod): seguro en el navegador.
 *
 * Seguridad (por qué tan estricto):
 *  - La configuración heredada era `z.record(z.string(), z.unknown())`: se
 *    guardaba cualquier JSON y el constructor de consultas leía de él nombres
 *    de columnas, funciones de agregación y filtros. Aquí cada campo tiene un
 *    tipo cerrado (`.strict()`), los nombres de columna siguen el patrón de un
 *    identificador de PostgreSQL y las agregaciones, operadores y unidades de
 *    tiempo son listas cerradas. No hay SQL libre en ningún sitio.
 *  - Límites de tamaño (número de columnas y filtros, longitud de textos)
 *    para que un *widget* no pueda pedir consultas desproporcionadas.
 *  - Que las columnas existan de verdad en la tabla lo comprueba la API con
 *    `collectWidgetColumns` contra el metadato de la tabla gestionada.
 *
 * [TFG] RF-11 · RNF-02 · ADR-013.
 */
import { z } from 'zod';

/** Ancho de la rejilla del panel, en columnas. */
export const DASHBOARD_GRID_COLUMNS = 12;

/** Fila máxima de la rejilla (evita posiciones absurdas en el JSON). */
export const DASHBOARD_MAX_GRID_ROW = 1000;

/** Altura máxima de un *widget*, en filas de la rejilla. */
export const DASHBOARD_MAX_WIDGET_HEIGHT = 12;

/** Máximo de *widgets* en una actualización de posiciones. */
export const DASHBOARD_MAX_POSITION_UPDATES = 100;

/** Máximo de filtros fijos por *widget*. */
export const WIDGET_MAX_FILTERS = 10;

/** Máximo de columnas de un *widget* de tabla. */
export const WIDGET_MAX_TABLE_COLUMNS = 20;

/** Identificador de PostgreSQL sin comillas (máx. 63 caracteres). */
const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

export const WidgetIdentifierSchema = z.string().regex(IDENTIFIER_PATTERN);

export const WIDGET_TYPES = ['metric', 'chart', 'table'] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const WIDGET_AGGREGATIONS = [
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
] as const;
export type WidgetAggregation = (typeof WIDGET_AGGREGATIONS)[number];

export const WIDGET_CHART_TYPES = ['line', 'bar', 'pie'] as const;
export type WidgetChartType = (typeof WIDGET_CHART_TYPES)[number];

export const WIDGET_TIME_BUCKETS = [
  'hour',
  'day',
  'week',
  'month',
  'quarter',
  'year',
] as const;

export const WIDGET_FILTER_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'isNull',
  'notNull',
] as const;
export type WidgetFilterOperator = (typeof WIDGET_FILTER_OPERATORS)[number];

export const WIDGET_METRIC_FORMATS = [
  'number',
  'decimal',
  'currency',
  'percentage',
] as const;

/** Posición de un *widget*: enteros dentro de la rejilla. */
export const WidgetPositionSchema = z
  .object({
    x: z
      .number()
      .int()
      .min(0)
      .max(DASHBOARD_GRID_COLUMNS - 1),
    y: z.number().int().min(0).max(DASHBOARD_MAX_GRID_ROW),
    w: z.number().int().min(1).max(DASHBOARD_GRID_COLUMNS),
    h: z.number().int().min(1).max(DASHBOARD_MAX_WIDGET_HEIGHT),
  })
  .strict()
  .refine((position) => position.x + position.w <= DASHBOARD_GRID_COLUMNS, {
    message: 'The widget does not fit in the grid',
  });

export type WidgetPosition = z.infer<typeof WidgetPositionSchema>;

/**
 * Filtro fijo de un *widget*: columna, operador de una lista cerrada y valor
 * escalar. El valor viaja como parámetro enlazado (nunca se interpola).
 */
export const WidgetFilterSchema = z
  .object({
    column: WidgetIdentifierSchema,
    operator: z.enum(WIDGET_FILTER_OPERATORS),
    value: z
      .union([z.string().max(200), z.number().finite(), z.boolean()])
      .nullable(),
  })
  .strict();

export type WidgetFilter = z.infer<typeof WidgetFilterSchema>;

const FiltersSchema = z.array(WidgetFilterSchema).max(WIDGET_MAX_FILTERS);

/** Columna a agregar, o `*` (solo con `COUNT`). */
const AggregatedColumnSchema = z.union([
  z.literal('*'),
  WidgetIdentifierSchema,
]);

/** `*` solo tiene sentido con `COUNT`: `SUM(*)` no existe. */
function starOnlyWithCount(config: { aggregation: string; column: string }) {
  return config.column !== '*' || config.aggregation === 'COUNT';
}

/** Métrica: un único número (recuento, suma, media… de una columna). */
export const MetricWidgetConfigSchema = z
  .object({
    aggregation: z.enum(WIDGET_AGGREGATIONS),
    metric: AggregatedColumnSchema,
    format: z.enum(WIDGET_METRIC_FORMATS).optional(),
    prefix: z.string().max(16).optional(),
    suffix: z.string().max(16).optional(),
    filters: FiltersSchema.optional(),
  })
  .strict()
  .refine(
    (config) =>
      starOnlyWithCount({
        aggregation: config.aggregation,
        column: config.metric,
      }),
    { message: 'Only COUNT can aggregate all rows', path: ['metric'] },
  );

/** Gráfico: serie agregada por el eje X (líneas, barras o sectores). */
export const ChartWidgetConfigSchema = z
  .object({
    chartType: z.enum(WIDGET_CHART_TYPES),
    xAxis: WidgetIdentifierSchema,
    yAxis: AggregatedColumnSchema,
    aggregation: z.enum(WIDGET_AGGREGATIONS),
    timeAggregation: z.enum(WIDGET_TIME_BUCKETS).optional(),
    showLegend: z.boolean().optional(),
    filters: FiltersSchema.optional(),
  })
  .strict()
  .refine(
    (config) =>
      starOnlyWithCount({
        aggregation: config.aggregation,
        column: config.yAxis,
      }),
    { message: 'Only COUNT can aggregate all rows', path: ['yAxis'] },
  );

/** Tabla: filas de la tabla con las columnas elegidas. */
export const TableWidgetConfigSchema = z
  .object({
    columns: z
      .array(WidgetIdentifierSchema)
      .min(1)
      .max(WIDGET_MAX_TABLE_COLUMNS)
      .refine((columns) => new Set(columns).size === columns.length, {
        message: 'Duplicate columns',
      }),
    sortBy: WidgetIdentifierSchema.optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    pageSize: z.number().int().min(5).max(50).optional(),
    filters: FiltersSchema.optional(),
  })
  .strict();

export type MetricWidgetConfig = z.infer<typeof MetricWidgetConfigSchema>;
export type ChartWidgetConfig = z.infer<typeof ChartWidgetConfigSchema>;
export type TableWidgetConfig = z.infer<typeof TableWidgetConfigSchema>;

const WidgetSourceSchema = {
  title: z.string().trim().min(1).max(255),
  schemaName: WidgetIdentifierSchema,
  tableName: WidgetIdentifierSchema,
};

/**
 * Definición de un *widget* (tipo, título, tabla de origen y configuración),
 * discriminada por el tipo para que cada uno lleve solo su configuración.
 */
export const WidgetDefinitionSchema = z.discriminatedUnion('widgetType', [
  z
    .object({
      widgetType: z.literal('metric'),
      ...WidgetSourceSchema,
      config: MetricWidgetConfigSchema,
    })
    .strict(),
  z
    .object({
      widgetType: z.literal('chart'),
      ...WidgetSourceSchema,
      config: ChartWidgetConfigSchema,
    })
    .strict(),
  z
    .object({
      widgetType: z.literal('table'),
      ...WidgetSourceSchema,
      config: TableWidgetConfigSchema,
    })
    .strict(),
]);

export type WidgetDefinition = z.infer<typeof WidgetDefinitionSchema>;

/** Nombre de un panel: el mismo límite que la restricción de la tabla. */
export const DashboardNameSchema = z.string().trim().min(3).max(255);

export const DASHBOARD_SHARE_LEVELS = ['view', 'edit'] as const;
export type DashboardShareLevel = (typeof DASHBOARD_SHARE_LEVELS)[number];

/**
 * Todas las columnas que usa un *widget* (eje, métrica, columnas de la
 * tabla, orden y filtros), sin `*` ni repetidos. La API comprueba que todas
 * existan en el metadato de la tabla antes de guardar.
 */
export function collectWidgetColumns(definition: WidgetDefinition): string[] {
  const columns = new Set<string>();
  const add = (column: string | undefined) => {
    if (column && column !== '*') {
      columns.add(column);
    }
  };

  switch (definition.widgetType) {
    case 'metric':
      add(definition.config.metric);
      break;
    case 'chart':
      add(definition.config.xAxis);
      add(definition.config.yAxis);
      break;
    case 'table':
      definition.config.columns.forEach(add);
      add(definition.config.sortBy);
      break;
  }

  definition.config.filters?.forEach((filter) => add(filter.column));

  return [...columns];
}
