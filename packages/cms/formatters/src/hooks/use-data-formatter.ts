/**
 * *Hooks* de React sobre el servicio de formateo de datos del CMS.
 *
 * `DataFormatterService` (lógica pura, compartida con el servidor) sabe
 * formatear números, monedas, porcentajes, fechas y textos. Estos *hooks*
 * crean una instancia con el contexto del usuario (idioma y zona horaria,
 * ver `useFormatterContext`) y exponen atajos para los casos habituales de
 * las celdas de las tablas.
 */
import { useCallback, useMemo } from 'react';

import {
  type ColumnFormattingConfig,
  DataFormatterService,
  type FormatterConfig,
  type FormatterContext,
} from '../formatters';
import { useFormatterContext } from './formatter-provider';

/**
 * Una instancia del servicio por combinación de idioma y zona horaria. Cada
 * celda numérica o de fecha usa estos *hooks*; crear un servicio por celda
 * (registra todos los formateadores al construirse) sería un derroche en
 * tablas con cientos de celdas.
 */
const servicesCache = new Map<string, DataFormatterService>();

function getFormatterService(context: FormatterContext) {
  const key = `${context.locale}|${context.timezone}|${context.currency}`;
  let service = servicesCache.get(key);

  if (!service) {
    service = new DataFormatterService(context);
    servicesCache.set(key, service);
  }

  return service;
}

type NumberOptions = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

/**
 * Devuelve el servicio de formateo configurado para el usuario y atajos para
 * números, monedas, porcentajes, fechas y textos.
 */
export function useDataFormatter() {
  const context = useFormatterContext();

  const formatter = useMemo(() => getFormatterService(context), [context]);

  const format = useCallback(
    (value: unknown, config: FormatterConfig) =>
      formatter.format(value, config),
    [formatter],
  );

  const formatByColumn = useCallback(
    (value: unknown, columnConfig: ColumnFormattingConfig) =>
      formatter.formatByColumn(value, columnConfig),
    [formatter],
  );

  const formatNumber = useCallback(
    (
      value: unknown,
      options?: NumberOptions & {
        notation?: 'standard' | 'compact' | 'scientific';
      },
    ) => formatter.format(value, { type: 'number', ...options }).formatted,
    [formatter],
  );

  const formatCurrency = useCallback(
    (value: unknown, currency?: string, options?: NumberOptions) =>
      formatter.format(value, {
        type: 'currency',
        currency: currency || context.currency,
        ...options,
      }).formatted,
    [formatter, context.currency],
  );

  const formatPercentage = useCallback(
    (value: unknown, options?: NumberOptions) =>
      formatter.format(value, {
        type: 'percentage',
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
        ...options,
      }).formatted,
    [formatter],
  );

  const formatText = useCallback(
    (
      value: unknown,
      options?: {
        type?:
          | 'text'
          | 'email'
          | 'url'
          | 'phone'
          | 'truncate'
          | 'capitalize'
          | 'uppercase'
          | 'lowercase';
        maxLength?: number;
        truncatePosition?: 'start' | 'middle' | 'end';
      },
    ) => formatter.format(value, { type: 'text', ...options }).formatted,
    [formatter],
  );

  return {
    format,
    formatByColumn,
    formatNumber,
    formatCurrency,
    formatPercentage,
    formatText,
    context,
  };
}

/**
 * Atajo de `useDataFormatter` con solo los formateadores numéricos.
 */
export function useNumberFormatter() {
  const { formatNumber, formatCurrency, formatPercentage } = useDataFormatter();

  return { formatNumber, formatCurrency, formatPercentage };
}
