/**
 * Formulario del editor de *widgets*: valores del formulario ↔ definición
 * estricta que acepta la API (F2.8).
 *
 * El formulario es plano (un campo por control) para que TanStack Form lo
 * gestione sin estructuras anidadas; `toWidgetDefinition` lo convierte en la
 * `WidgetDefinition` de `@pymekit/cms-shared/dashboards` y la valida con el
 * mismo esquema Zod que la API, así que lo que el editor deja guardar es lo
 * que la API acepta. `widgetToFormValues` hace el camino inverso al editar o
 * duplicar.
 *
 * [TFG] RF-11 · ADR-013.
 */
import {
  WIDGET_FILTER_OPERATORS,
  type WidgetAggregation,
  type WidgetChartType,
  type WidgetDefinition,
  WidgetDefinitionSchema,
  type WidgetFilter,
  type WidgetFilterOperator,
  type WidgetType,
} from '@pymekit/cms-shared/dashboards';

/** Unidades de tiempo del eje X (vacío: sin agrupar por fecha). */
export type TimeBucket = '' | 'day' | 'week' | 'month' | 'year';

export type WidgetFormValues = {
  title: string;
  widgetType: WidgetType;
  /** Tabla de origen como `esquema.tabla`. */
  table: string;
  aggregation: WidgetAggregation;
  /** Columna agregada (métrica o eje Y); `*` = todas las filas. */
  valueColumn: string;
  chartType: WidgetChartType;
  xAxis: string;
  timeBucket: TimeBucket;
  columns: string[];
  /** Un filtro opcional (columna vacía: sin filtro). */
  filterColumn: string;
  filterOperator: WidgetFilterOperator;
  filterValue: string;
};

/** Valores iniciales de un *widget* nuevo. */
export function getDefaultWidgetFormValues(): WidgetFormValues {
  return {
    title: '',
    widgetType: 'metric',
    table: '',
    aggregation: 'COUNT',
    valueColumn: '*',
    chartType: 'bar',
    xAxis: '',
    timeBucket: '',
    columns: [],
    filterColumn: '',
    filterOperator: 'eq',
    filterValue: '',
  };
}

/** Separa `esquema.tabla` (el primer punto separa; los nombres no llevan). */
export function splitTableKey(table: string) {
  const index = table.indexOf('.');

  return index > 0
    ? { schemaName: table.slice(0, index), tableName: table.slice(index + 1) }
    : null;
}

const NUMERIC_TYPES = new Set([
  'integer',
  'bigint',
  'smallint',
  'real',
  'double precision',
  'numeric',
]);

const DATE_TYPES = new Set([
  'date',
  'timestamp',
  'timestamp with time zone',
  'timestamp without time zone',
]);

/** ¿Columna numérica (sumable)? */
export function isNumericDataType(dataType: string | undefined) {
  return NUMERIC_TYPES.has(dataType ?? '');
}

/** ¿Columna de fecha (agrupable por día, semana…)? */
export function isDateDataType(dataType: string | undefined) {
  return DATE_TYPES.has(dataType ?? '');
}

/** Filtro del formulario, o ninguno si no se eligió columna. */
function toFilters(values: WidgetFormValues): WidgetFilter[] | undefined {
  if (!values.filterColumn) {
    return undefined;
  }

  const withoutValue =
    values.filterOperator === 'isNull' || values.filterOperator === 'notNull';

  return [
    {
      column: values.filterColumn,
      operator: values.filterOperator,
      value: withoutValue ? null : values.filterValue.trim(),
    },
  ];
}

/**
 * Convierte los valores del formulario en la definición que se envía a la
 * API. Devuelve `null` si no es válida según el esquema compartido.
 */
export function toWidgetDefinition(
  values: WidgetFormValues,
): WidgetDefinition | null {
  const source = splitTableKey(values.table);

  if (!source) {
    return null;
  }

  const filters = toFilters(values);
  const base = { title: values.title.trim(), ...source };
  let candidate: unknown;

  switch (values.widgetType) {
    case 'metric':
      candidate = {
        ...base,
        widgetType: 'metric',
        config: {
          aggregation: values.aggregation,
          metric: values.valueColumn,
          ...(filters ? { filters } : {}),
        },
      };
      break;
    case 'chart':
      candidate = {
        ...base,
        widgetType: 'chart',
        config: {
          chartType: values.chartType,
          xAxis: values.xAxis,
          yAxis: values.valueColumn,
          aggregation: values.aggregation,
          ...(values.timeBucket ? { timeAggregation: values.timeBucket } : {}),
          ...(filters ? { filters } : {}),
        },
      };
      break;
    case 'table':
      candidate = {
        ...base,
        widgetType: 'table',
        config: {
          columns: values.columns,
          ...(filters ? { filters } : {}),
        },
      };
      break;
  }

  const result = WidgetDefinitionSchema.safeParse(candidate);

  return result.success ? result.data : null;
}

/** Lo mínimo de un *widget* guardado que necesita el formulario. */
export type StoredWidget = {
  widgetType: WidgetType;
  title: string;
  schemaName: string;
  tableName: string;
  config: unknown;
};

/** Valores del formulario a partir de un *widget* guardado (editar/duplicar). */
export function widgetToFormValues(widget: StoredWidget): WidgetFormValues {
  const values = getDefaultWidgetFormValues();
  const config = (
    widget.config && typeof widget.config === 'object' ? widget.config : {}
  ) as Record<string, unknown>;
  const text = (key: string) =>
    typeof config[key] === 'string' ? (config[key] as string) : '';

  values.title = widget.title;
  values.widgetType = widget.widgetType;
  values.table = `${widget.schemaName}.${widget.tableName}`;

  const aggregation = text('aggregation').toUpperCase();
  if (['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(aggregation)) {
    values.aggregation = aggregation as WidgetAggregation;
  }

  if (widget.widgetType === 'metric') {
    values.valueColumn = text('metric') || '*';
  }

  if (widget.widgetType === 'chart') {
    values.valueColumn = text('yAxis') || '*';
    values.xAxis = text('xAxis');
    const chartType = text('chartType');
    if (chartType === 'line' || chartType === 'bar' || chartType === 'pie') {
      values.chartType = chartType;
    }
    const bucket = text('timeAggregation');
    if (['day', 'week', 'month', 'year'].includes(bucket)) {
      values.timeBucket = bucket as TimeBucket;
    }
  }

  if (widget.widgetType === 'table' && Array.isArray(config['columns'])) {
    values.columns = (config['columns'] as unknown[]).filter(
      (column): column is string => typeof column === 'string',
    );
  }

  const [filter] = Array.isArray(config['filters'])
    ? (config['filters'] as Array<Record<string, unknown>>)
    : [];

  if (
    filter &&
    typeof filter['column'] === 'string' &&
    (WIDGET_FILTER_OPERATORS as readonly string[]).includes(
      String(filter['operator']),
    )
  ) {
    values.filterColumn = filter['column'];
    values.filterOperator = filter['operator'] as WidgetFilterOperator;
    values.filterValue =
      filter['value'] === null || filter['value'] === undefined
        ? ''
        : String(filter['value']);
  }

  return values;
}
