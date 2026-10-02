/**
 * *Hooks* de presentación de los filtros: fechas legibles, etiquetas de
 * fechas relativas y opciones de los filtros booleanos y enumerados.
 *
 * Usan la zona horaria de las preferencias del CMS (a través de los
 * formateadores de `@pymekit/cms-formatters/hooks`) para que un filtro «hoy»
 * muestre la misma fecha que las celdas de la tabla.
 */
import { useCallback, useMemo } from 'react';

import { useTranslations } from 'use-intl';

import {
  useDateFormatter,
  useFormatterContext,
} from '@pymekit/cms-formatters/hooks';
import { useEnumLabel } from '@pymekit/i18n/enum-labels';

import type { FilterItem, RelativeDateOption } from '../types';
import type { FilterLabelFormatters } from '../utils/filter-params';

/** Zona horaria con la que se muestran y eligen las fechas de los filtros. */
export function useTimezone() {
  return useFormatterContext().timezone;
}

/** Devuelve una función que muestra una fecha como «ene 05, 2025». */
export function useFormatDateForDisplay() {
  const dateFormatter = useDateFormatter();

  return useCallback(
    (date: string | Date) => {
      const parsed = date instanceof Date ? date : new Date(date);

      return dateFormatter(parsed, 'LLL dd, yyyy');
    },
    [dateFormatter],
  );
}

/**
 * Devuelve las funciones de presentación que necesita el análisis de los
 * filtros de la URL (`parseFiltersFromParams`).
 */
export function useFilterLabelFormatters(): FilterLabelFormatters {
  const t = useTranslations('cms.dataExplorer');
  const formatDateForDisplay = useFormatDateForDisplay();

  return useMemo(
    () => ({
      formatTimestamp: (date: Date) => {
        const today = formatDateForDisplay(new Date());
        const formatted = formatDateForDisplay(date);

        return formatted === today ? t('filters.today') : formatted;
      },
      formatRelativeDate: (option: RelativeDateOption) =>
        t(`relativeDates.${option}`),
      formatBoolean: (value: boolean) =>
        value ? t('filters.true') : t('filters.false'),
    }),
    [formatDateForDisplay, t],
  );
}

/**
 * Opciones fijas de un filtro: «Verdadero/Falso» para los booleanos y los
 * valores del enumerado para las columnas con `enum_values`. Para el resto
 * devuelve una lista vacía (se escribe el valor a mano).
 */
export function useFilterOptions(filter: FilterItem) {
  const t = useTranslations('cms.dataExplorer');
  const enumLabel = useEnumLabel();
  const { enum_type: enumName, value_labels: valueLabels } = filter.ui_config;

  return useMemo(() => {
    if (filter.ui_config.data_type === 'boolean') {
      return [
        { label: t('filters.true'), value: true },
        { label: t('filters.false'), value: false },
      ];
    }

    const enumValues = filter.ui_config.enum_values;

    if (enumValues && enumValues.length > 0) {
      // Se muestra la etiqueta legible; `value` (lo que va a la URL y a la
      // consulta) sigue siendo el valor real del enumerado.
      return enumValues.map((value) => ({
        label: enumLabel(value, { enumName, overrides: valueLabels }),
        value,
      }));
    }

    return [] as Array<{ label: string; value: string | boolean }>;
  }, [
    filter.ui_config.data_type,
    filter.ui_config.enum_values,
    enumName,
    valueLabels,
    enumLabel,
    t,
  ]);
}
