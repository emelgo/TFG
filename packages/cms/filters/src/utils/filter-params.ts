/**
 * Conversión entre los filtros de la interfaz y su forma en la URL.
 *
 * En la URL (y en la API, parámetro `properties`) cada filtro es una pareja
 * `"columna.operador": "valor"`, por ejemplo `"name.contains": "ana"` o
 * `"created_at.gte": "__rel_date:last7Days"`. Así un filtro se puede
 * compartir copiando el enlace y el servidor lo valida contra el metadato de
 * la tabla antes de construir la consulta.
 *
 * Aquí se hace la traducción en los dos sentidos, enriqueciendo el valor con
 * lo que necesita la interfaz (fechas como `Date`, etiquetas de fechas
 * relativas, booleanos, etiquetas de claves foráneas).
 */
import {
  extractRelativeDateOption,
  isRelativeDate,
} from '@pymekit/cms-filters-core';
import type { ColumnMetadata, RelationConfig } from '@pymekit/cms-types';

import { isDateDataType } from '../constants';
import type {
  FilterItem,
  FilterValue,
  RelatedDataItem,
  RelativeDateOption,
} from '../types';
import { mapDateOperator, mapSqlToDateOperator } from './operators';

/** Funciones de presentación que necesita el análisis de la URL. */
export type FilterLabelFormatters = {
  formatTimestamp: (date: Date) => string;
  formatRelativeDate: (option: RelativeDateOption) => string;
  formatBoolean: (value: boolean) => string;
};

/**
 * Separa una clave `"columna.operador"`. El operador es lo que va tras el
 * último punto, así que una columna con puntos en el nombre sigue funcionando;
 * sin punto se asume «es igual a».
 */
export function splitFilterKey(key: string) {
  const index = key.lastIndexOf('.');

  if (index <= 0) {
    return { columnName: key, operator: 'eq' };
  }

  return {
    columnName: key.slice(0, index),
    operator: key.slice(index + 1) || 'eq',
  };
}

/**
 * Convierte los filtros de la URL en filtros de la interfaz. Se ignoran los
 * que apuntan a columnas que no existen o no se pueden filtrar, y los que no
 * tienen valor.
 */
export function parseFiltersFromParams(
  params: Record<string, string>,
  columns: ColumnMetadata[],
  relations: RelationConfig[],
  relatedData: RelatedDataItem[],
  formatters: FilterLabelFormatters,
): FilterItem[] {
  const filters: FilterItem[] = [];

  for (const [key, value] of Object.entries(params)) {
    const { columnName, operator } = splitFilterKey(key);
    const column = columns.find((col) => col.name === columnName);

    if (!column || !value) {
      continue;
    }

    const filterOperator = mapSqlToDateOperator(
      operator,
      column.ui_config.data_type,
    );

    filters.push({
      ...column,
      relations: relations.filter((r) => r.source_column === column.name),
      values: [
        parseFilterValue({
          value,
          column,
          operator: filterOperator,
          relatedData,
          formatters,
        }),
      ],
    });
  }

  return filters;
}

/**
 * Convierte los filtros de la interfaz en parejas `"columna.operador"` para la
 * URL. Solo se incluyen los que tienen valor, y los operadores de fecha se
 * traducen a su equivalente SQL.
 */
export function filtersToParams(filters: FilterItem[]) {
  const params: Record<string, string> = {};

  for (const filter of filters) {
    const filterValue = filter.values[0];
    const value = filterValue?.value;

    if (value === null || value === undefined || value === '') {
      continue;
    }

    let operator = filterValue?.operator || 'eq';

    if (isDateDataType(filter.ui_config.data_type)) {
      operator = mapDateOperator(operator);
    }

    params[`${filter.name}.${operator}`] =
      value instanceof Date ? value.toISOString() : String(value);
  }

  return params;
}

function parseFilterValue(params: {
  value: string;
  column: ColumnMetadata;
  operator: string;
  relatedData: RelatedDataItem[];
  formatters: FilterLabelFormatters;
}): FilterValue {
  const { value, column, operator, relatedData, formatters } = params;
  const type = column.ui_config.data_type;

  let filterValue: FilterValue = { operator, value, label: value };

  if (isDateDataType(type)) {
    const relativeDateOption = isRelativeDate(value)
      ? extractRelativeDateOption(value)
      : null;

    if (relativeDateOption) {
      filterValue = {
        operator,
        value,
        label: formatters.formatRelativeDate(relativeDateOption),
        isRelativeDate: true,
        relativeDateOption,
      };
    } else {
      const date = new Date(value);

      // Los rangos («a,b») no son una fecha: se conservan como texto.
      if (!Number.isNaN(date.getTime())) {
        filterValue = {
          operator,
          value: date,
          label: formatters.formatTimestamp(date),
        };
      }
    }
  } else if (type === 'boolean') {
    const boolValue = value.toLowerCase() === 'true';

    filterValue = {
      operator,
      value: boolValue,
      label: formatters.formatBoolean(boolValue),
    };
  }

  // Para una clave foránea se muestra la etiqueta de la fila relacionada si
  // la página actual la trae (por ejemplo, el nombre de la cuenta).
  const related = relatedData.find(
    (item) =>
      item.column === column.name && String(item.original) === String(value),
  );

  if (related?.formatted) {
    filterValue.label = related.formatted;
  }

  return filterValue;
}
