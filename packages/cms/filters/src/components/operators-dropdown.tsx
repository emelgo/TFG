import { useMemo } from 'react';

import { useTranslations } from 'use-intl';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pymekit/ui/select';

import type { FilterOperator } from '../types';
import { getOperatorsForDataType } from '../utils/operators';

/**
 * Selector del operador de un filtro. Solo ofrece los operadores válidos para
 * el tipo de la columna (ver `getOperatorsForDataType`).
 */
export function OperatorDropdown({
  operator,
  onOperatorChange,
  dataType,
  isEnum,
}: {
  operator?: string;
  onOperatorChange: (op: FilterOperator | null) => void;
  dataType: string;
  isEnum?: boolean;
}) {
  const t = useTranslations('cms.dataExplorer');

  const options = useMemo(
    () => getOperatorsForDataType(dataType, isEnum),
    [dataType, isEnum],
  );

  const value =
    operator && options.includes(operator as FilterOperator) ? operator : 'eq';

  return (
    <Select
      value={value}
      onValueChange={(next) => onOperatorChange(next as FilterOperator | null)}
    >
      <SelectTrigger
        tabIndex={-1}
        data-testid="filter-operator-select"
        className="h-6 w-auto max-w-40 border-transparent px-1.5 text-xs"
      >
        <SelectValue>{(val) => t(`operators.${String(val)}`)}</SelectValue>
      </SelectTrigger>

      <SelectContent>
        {options.map((op) => (
          <SelectItem
            key={op}
            value={op}
            data-testid="filter-operator-option"
            data-operator={op}
            className="h-7 text-xs"
          >
            {t(`operators.${op}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
