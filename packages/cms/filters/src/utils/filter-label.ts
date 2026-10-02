/**
 * Texto de la «píldora» de un filtro aplicado («Nombre contiene ana»,
 * «Creado entre 1 ene y 5 ene», «Correo está vacío»…).
 *
 * Es una función pura que recibe las funciones de traducción y formateo, para
 * poder probarla sin React (`__tests__/filter-label.test.ts`).
 */
import {
  extractRelativeDateOption,
  isRelativeDate,
} from '@pymekit/cms-filters-core';

import { isDateDataType } from '../constants';
import type { FilterItem, RelativeDateOption } from '../types';
import { mapSqlToDateOperator } from './operators';

export type FilterLabelDeps = {
  /** Traducción con las claves de `cms.dataExplorer`. */
  t: (key: string, values?: Record<string, string>) => string;
  formatDate: (date: string | Date) => string;
  formatRelativeDate: (option: RelativeDateOption) => string;
  options: Array<{ label: string; value: string | boolean }>;
};

function formatDateValue(value: string, deps: FilterLabelDeps) {
  if (!value.trim()) {
    return deps.t('filters.pickADate');
  }

  const option = isRelativeDate(value)
    ? extractRelativeDateOption(value)
    : null;

  return option ? deps.formatRelativeDate(option) : deps.formatDate(value);
}

/** Devuelve el texto que resume un filtro. */
export function getFilterDisplayValue(
  filter: FilterItem,
  deps: FilterLabelDeps,
) {
  const { t } = deps;
  const name = filter.display_name || filter.name;
  const current = filter.values[0];
  const value = current?.value;
  const dataType = filter.ui_config.data_type;
  const isDate = isDateDataType(dataType);

  if (value === null || value === undefined) {
    return name;
  }

  const operator = mapSqlToDateOperator(current?.operator || 'eq', dataType);

  if (operator === 'isNull') {
    return t('filters.isEmpty', { name });
  }

  if (operator === 'notNull') {
    return t('filters.isNotEmpty', { name });
  }

  const operatorText = t(`operators.${operator}`).toLowerCase();

  if (operator === 'between' || operator === 'notBetween') {
    if (typeof value !== 'string' || !value.includes(',')) {
      return `${name} ${operatorText}`;
    }

    const [start = '', end = ''] = value.split(',');

    return t('filters.betweenValues', {
      name,
      operator: operatorText,
      start: isDate ? formatDateValue(start, deps) : start,
      end: isDate ? formatDateValue(end, deps) : end,
    });
  }

  if (typeof value === 'string' && isRelativeDate(value)) {
    return `${name} ${operatorText} ${formatDateValue(value, deps)}`;
  }

  if (isDate && (value instanceof Date || typeof value === 'string')) {
    return `${name} ${operatorText} ${deps.formatDate(value)}`;
  }

  if (typeof value === 'boolean') {
    return `${name} ${operatorText} ${
      value ? t('filters.true') : t('filters.false')
    }`;
  }

  const option = deps.options.find((o) => String(o.value) === String(value));

  if (option) {
    return `${name} ${operatorText} ${option.label}`;
  }

  const label = current?.label;

  if (label && label !== String(value)) {
    return `${name} ${operatorText} ${label}`;
  }

  return `${name} ${operatorText} ${String(value)}`;
}
