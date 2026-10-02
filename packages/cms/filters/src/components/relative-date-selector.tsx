import { useTranslations } from 'use-intl';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@pymekit/ui/select';

import type { RelativeDateOption } from '../types';

const RELATIVE_DATE_OPTIONS: RelativeDateOption[] = [
  'today',
  'yesterday',
  'tomorrow',
  'thisWeek',
  'lastWeek',
  'nextWeek',
  'thisMonth',
  'lastMonth',
  'last7Days',
  'last30Days',
  'thisYear',
  'lastYear',
];

/**
 * Selector de fechas relativas («hoy», «últimos 7 días»…). Una fecha
 * relativa se guarda como tal en la URL (`__rel_date:last7Days`) y el
 * servidor la resuelve en cada consulta, así que una vista guardada con
 * «últimos 7 días» sigue siendo útil mañana. «Fecha concreta» abre el
 * calendario.
 */
export function RelativeDateSelector({
  value,
  onChange,
  onCustomDateSelect,
}: {
  value: RelativeDateOption | null;
  onChange: (option: RelativeDateOption) => void;
  onCustomDateSelect?: () => void;
}) {
  const t = useTranslations('cms.dataExplorer');

  return (
    <Select
      value={value || 'custom'}
      onValueChange={(option) => {
        if (!option || option === 'custom') {
          onCustomDateSelect?.();
        } else {
          onChange(option as RelativeDateOption);
        }
      }}
    >
      <SelectTrigger
        className="h-7 w-full text-xs"
        data-testid="relative-date-trigger"
      >
        <SelectValue placeholder={t('filters.relativeDateSelect')}>
          {(val) =>
            val === 'custom'
              ? t('filters.customDate')
              : t(`relativeDates.${String(val)}`)
          }
        </SelectValue>
      </SelectTrigger>

      <SelectContent>
        {RELATIVE_DATE_OPTIONS.map((option) => (
          <SelectItem
            data-testid="relative-date-option"
            data-option={option}
            className="h-7 text-xs"
            key={option}
            value={option}
          >
            {t(`relativeDates.${option}`)}
          </SelectItem>
        ))}

        <SelectSeparator />

        <SelectItem
          value="custom"
          className="h-7 text-xs"
          data-testid="custom-date-option"
        >
          {t('filters.customDate')}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
