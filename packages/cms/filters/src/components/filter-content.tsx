/**
 * Contenido del desplegable de un filtro: selector de operador y el control
 * adecuado para introducir el valor según el tipo de la columna.
 *
 * | Tipo de columna / operador       | Control                                   |
 * |----------------------------------|-------------------------------------------|
 * | «está vacío» / «no está vacío»   | ninguno (se aplica al elegir el operador) |
 * | rango («entre», «no entre»)      | dos calendarios o dos campos numéricos    |
 * | fecha                            | fechas relativas + calendario             |
 * | booleano                         | casillas «Verdadero/Falso»                |
 * | clave foránea (tabla legible)    | autocompletado con filas de la tabla      |
 * | enumerado                        | lista de valores                          |
 * | JSON/JSONB                       | `JsonFilterInput` (texto, clave, ruta)     |
 * | resto                            | campo de texto validado al pulsar Intro   |
 *
 * El operador elegido se guarda en estado local hasta que hay un valor que
 * aplicar, para no lanzar consultas incompletas mientras el usuario decide.
 */
import { useState } from 'react';

import { useForm } from '@tanstack/react-form';
import { useTranslations } from 'use-intl';

import {
  extractRelativeDateOption,
  getRelativeDateRange,
  isRelativeDate,
} from '@pymekit/cms-filters-core';
import { Button } from '@pymekit/ui/button';
import { Calendar } from '@pymekit/ui/calendar';
import { Checkbox } from '@pymekit/ui/checkbox';
import { DataTypeIcon } from '@pymekit/ui/datatype-icon';
import { Field, FieldDescription, FieldError } from '@pymekit/ui/field';
import { If } from '@pymekit/ui/if';
import { Input } from '@pymekit/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pymekit/ui/select';

import { RELATIVE_DATE_PREFIX, isDateDataType } from '../constants';
import {
  useFilterLabelFormatters,
  useFilterOptions,
  useTimezone,
} from '../hooks/use-filter-labels';
import { useTableAccessCheck } from '../hooks/use-table-access-check';
import type {
  FilterItem,
  FilterOperator,
  FilterValue,
  RelativeDateOption,
} from '../types';
import {
  getFilterInputConfig,
  isValidFilterInput,
} from '../utils/filter-input';
import { AutocompleteDropdown } from './autocomplete-dropdown';
import { CalendarPopover } from './calendar-popover';
import { JsonFilterInput } from './json-filter-input';
import { OperatorDropdown } from './operators-dropdown';
import { RelativeDateSelector } from './relative-date-selector';

type OnValueChange = (
  filter: FilterItem,
  value: FilterValue,
  shouldClose?: boolean,
) => void;

const isBetweenOperator = (op: string | null | undefined) =>
  op === 'between' || op === 'notBetween';

const isNullOperator = (op: string | null | undefined) =>
  op === 'isNull' || op === 'notNull';

/** Interpreta un valor guardado como fecha (sin las relativas). */
function parseDate(value: unknown) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' && value && !isRelativeDate(value)) {
    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  return undefined;
}

/** Separa un valor de rango `inicio,fin`. */
function splitRange(value: unknown) {
  if (typeof value === 'string' && value.includes(',')) {
    const [start = '', end = ''] = value.split(',');

    return { start, end };
  }

  return { start: '', end: '' };
}

export function FilterContent(props: {
  filter: FilterItem;
  onRemove: (filter: FilterItem) => void;
  onValueChange: OnValueChange;
}) {
  const { filter, onValueChange } = props;
  const t = useTranslations('cms.dataExplorer');

  const dataType = filter.ui_config.data_type;
  const isDate = isDateDataType(dataType);
  const currentValue = filter.values[0]?.value;

  const [localOperator, setLocalOperator] = useState<FilterOperator | null>(
    () => (filter.values[0]?.operator as FilterOperator) || null,
  );

  const [range, setRange] = useState(() => splitRange(currentValue));

  // Sin fecha relativa elegida se muestra directamente el calendario.
  const [showCustomCalendar, setShowCustomCalendar] = useState(() => {
    const option =
      typeof currentValue === 'string' && isRelativeDate(currentValue)
        ? extractRelativeDateOption(currentValue)
        : null;

    return option === 'custom' || option === null;
  });

  const currentOperator = localOperator || filter.values[0]?.operator;

  /**
   * Cambia el operador. Los de nulos se aplican al momento (no necesitan
   * valor); los de rango preparan dos extremos vacíos. Para el resto solo se
   * recuerda el operador: se aplicará junto con el valor que dé el usuario.
   */
  const onOperatorChange = (operator: FilterOperator | null) => {
    if (!operator) {
      return;
    }

    setLocalOperator(operator);

    if (isNullOperator(operator)) {
      onValueChange(filter, { operator, value: true }, true);
      return;
    }

    if (isBetweenOperator(operator)) {
      setShowCustomCalendar(true);
      setRange({ start: '', end: '' });
    }
  };

  const renderInput = () => {
    if (isNullOperator(currentOperator)) {
      return (
        <div className="text-muted-foreground py-2 text-sm">
          {currentOperator === 'isNull'
            ? t('filters.noValueNeededNull')
            : t('filters.noValueNeededNotNull')}
        </div>
      );
    }

    if (isBetweenOperator(currentOperator)) {
      return (
        <RangeInput
          filter={filter}
          operator={currentOperator as FilterOperator}
          isDate={isDate}
          range={range}
          onRangeChange={setRange}
          onValueChange={onValueChange}
        />
      );
    }

    if (isDate) {
      return (
        <DateInput
          filter={filter}
          operator={currentOperator}
          showCustomCalendar={showCustomCalendar}
          onShowCustomCalendar={setShowCustomCalendar}
          onValueChange={onValueChange}
        />
      );
    }

    if (dataType === 'boolean') {
      return (
        <BooleanInput
          filter={filter}
          operator={currentOperator}
          onValueChange={onValueChange}
        />
      );
    }

    if (['json', 'jsonb'].includes(dataType)) {
      return (
        <JsonFilterInput
          filter={filter}
          currentOperator={localOperator}
          onValueChange={onValueChange}
        />
      );
    }

    return (
      <ValueInput
        filter={filter}
        operator={currentOperator}
        onValueChange={onValueChange}
        onRemove={props.onRemove}
      />
    );
  };

  return (
    <div className="space-y-2" data-testid="filter-content">
      <div className="flex items-center justify-between gap-x-1 border-b p-2">
        <div className="flex items-center gap-x-1">
          <DataTypeIcon
            className="text-muted-foreground h-3 w-3"
            type={dataType}
          />

          <div className="text-sm font-medium">
            {filter.display_name || filter.name}
          </div>
        </div>

        <If condition={!['json', 'jsonb'].includes(dataType)}>
          <OperatorDropdown
            operator={currentOperator}
            onOperatorChange={onOperatorChange}
            dataType={dataType}
            isEnum={Boolean(filter.ui_config.enum_values?.length)}
          />
        </If>
      </div>

      <div className="px-2 py-1 pb-2">{renderInput()}</div>
    </div>
  );
}

/** Dos extremos (fechas o números) y un botón para aplicar el rango. */
function RangeInput(props: {
  filter: FilterItem;
  operator: FilterOperator;
  isDate: boolean;
  range: { start: string; end: string };
  onRangeChange: (range: { start: string; end: string }) => void;
  onValueChange: OnValueChange;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { range, onRangeChange } = props;
  const canApply = Boolean(range.start && range.end);

  const apply = () => {
    if (canApply) {
      props.onValueChange(
        props.filter,
        { operator: props.operator, value: `${range.start},${range.end}` },
        true,
      );
    }
  };

  if (props.isDate) {
    const startDate = parseDate(range.start);
    const endDate = parseDate(range.end);

    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="text-muted-foreground text-xs">
            {t('filters.rangeFrom')}
          </div>

          <CalendarPopover
            testId="date-range-start-calendar"
            date={startDate}
            onChange={(start) => onRangeChange({ ...range, start })}
            disabled={(date) => (endDate ? date > endDate : false)}
          />
        </div>

        <div className="space-y-1">
          <div className="text-muted-foreground text-xs">
            {t('filters.rangeTo')}
          </div>

          <CalendarPopover
            testId="date-range-end-calendar"
            date={endDate}
            onChange={(end) => onRangeChange({ ...range, end })}
            disabled={(date) => (startDate ? date < startDate : false)}
          />
        </div>

        <Button
          data-testid="apply-date-range-button"
          size="sm"
          className="w-full"
          onClick={apply}
          disabled={!canApply}
        >
          {t('filters.applyRange')}
        </Button>
      </div>
    );
  }

  const inputType = getFilterInputConfig(props.filter).type;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-muted-foreground text-xs">
          {t('filters.rangeFrom')}
        </div>

        <Input
          autoFocus
          aria-label={t('filters.rangeFrom')}
          data-testid="filter-range-start-input"
          className="h-7 text-xs"
          type={inputType === 'number' ? 'number' : 'text'}
          value={range.start}
          onChange={(e) =>
            onRangeChange({ ...range, start: e.target.value.trim() })
          }
        />
      </div>

      <div className="space-y-1">
        <div className="text-muted-foreground text-xs">
          {t('filters.rangeTo')}
        </div>

        <Input
          aria-label={t('filters.rangeTo')}
          data-testid="filter-range-end-input"
          className="h-7 text-xs"
          type={inputType === 'number' ? 'number' : 'text'}
          value={range.end}
          onChange={(e) =>
            onRangeChange({ ...range, end: e.target.value.trim() })
          }
        />
      </div>

      <Button
        className="w-full"
        data-testid="apply-range-button"
        onClick={apply}
        disabled={!canApply}
      >
        {t('filters.applyRange')}
      </Button>
    </div>
  );
}

/** Fechas relativas y, si se elige «fecha concreta», un calendario. */
function DateInput(props: {
  filter: FilterItem;
  operator: string | undefined;
  showCustomCalendar: boolean;
  onShowCustomCalendar: (show: boolean) => void;
  onValueChange: OnValueChange;
}) {
  const t = useTranslations('cms.dataExplorer');
  const timezone = useTimezone();
  const { formatTimestamp, formatRelativeDate } = useFilterLabelFormatters();

  const { filter, operator } = props;
  const currentValue = filter.values[0]?.value;
  const isTimestamp = filter.ui_config.data_type.includes('timestamp');

  const relativeOption =
    typeof currentValue === 'string' && isRelativeDate(currentValue)
      ? extractRelativeDateOption(currentValue)
      : null;

  const onRelativeChange = (option: RelativeDateOption) => {
    props.onShowCustomCalendar(false);

    if (option === 'custom') {
      return;
    }

    // Las opciones con fin de rango («esta semana») solo se aplican como
    // rango si el operador es «entre»; con el resto se usa su inicio.
    const hasEnd = Boolean(getRelativeDateRange(option).end);
    const useRangeOperator = hasEnd && isBetweenOperator(operator);

    props.onValueChange(
      filter,
      {
        operator: useRangeOperator ? (operator as string) : operator || 'eq',
        value: `${RELATIVE_DATE_PREFIX}${option}`,
        label: formatRelativeDate(option),
      },
      true,
    );
  };

  const onDateSelect = (date: Date | undefined) => {
    if (!date) {
      return;
    }

    // En columnas `timestamp` que ya tenían una fecha se usa el final del día
    // elegido, para que «antes de» incluya ese día completo.
    if (isTimestamp && parseDate(currentValue)) {
      date.setHours(23, 59, 59);
    }

    props.onValueChange(
      filter,
      {
        operator: operator || 'eq',
        value: date.toISOString(),
        label: formatTimestamp(date),
      },
      true,
    );
  };

  return (
    <div className="space-y-3">
      <RelativeDateSelector
        value={relativeOption}
        onChange={onRelativeChange}
        onCustomDateSelect={() => props.onShowCustomCalendar(true)}
      />

      {props.showCustomCalendar && (
        <div className="space-y-2">
          <div className="text-muted-foreground text-xs">
            {t('filters.customDate')}
          </div>

          <Calendar
            timeZone={timezone}
            classNames={{ root: 'w-full' }}
            mode="single"
            selected={parseDate(currentValue)}
            onSelect={onDateSelect}
            className="rounded-md border"
          />
        </div>
      )}
    </div>
  );
}

/** Casillas «Verdadero» y «Falso»; se aplica al marcar una. */
function BooleanInput(props: {
  filter: FilterItem;
  operator: string | undefined;
  onValueChange: OnValueChange;
}) {
  const options = useFilterOptions(props.filter);
  const currentValue = props.filter.values[0]?.value;

  return (
    <div className="space-y-2">
      {options.map((option) => {
        const id = `${props.filter.name}-${String(option.value)}`;

        return (
          <div key={String(option.value)} className="flex items-center gap-2">
            <Checkbox
              data-testid="boolean-filter"
              data-value={String(option.value)}
              id={id}
              checked={currentValue === option.value}
              onCheckedChange={() =>
                props.onValueChange(
                  props.filter,
                  {
                    operator: props.operator || 'eq',
                    value: option.value as boolean,
                  },
                  true,
                )
              }
            />

            <label htmlFor={id} className="text-sm leading-none font-medium">
              {option.label}
            </label>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Valor escrito o elegido: autocompletado para claves foráneas legibles,
 * lista para enumerados y campo de texto para el resto.
 */
function ValueInput(props: {
  filter: FilterItem;
  operator: string | undefined;
  onValueChange: OnValueChange;
  onRemove: (filter: FilterItem) => void;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { filter, operator } = props;
  const options = useFilterOptions(filter);

  const relation =
    filter.relations?.find((r) => r.source_column === filter.name) ?? null;

  const { hasAccess } = useTableAccessCheck(
    relation?.target_schema ?? '',
    relation?.target_table ?? '',
  );

  if (relation && hasAccess) {
    return (
      <div className="min-w-[200px] space-y-2">
        <AutocompleteDropdown
          relation={relation}
          onChange={(value, label) =>
            props.onValueChange(
              filter,
              { operator: operator || 'eq', value, label },
              true,
            )
          }
        />
      </div>
    );
  }

  if (options.length > 0) {
    return (
      <Select
        value={String(filter.values[0]?.value ?? '')}
        onValueChange={(value) => {
          if (value) {
            props.onValueChange(filter, {
              operator: operator || 'eq',
              value: String(value),
            });
          }
        }}
      >
        <SelectTrigger
          className="h-7 w-full text-xs"
          data-testid="filter-value-select"
        >
          <SelectValue placeholder={t('filters.selectValue')}>
            {(val) =>
              val
                ? (options.find((o) => String(o.value) === val)?.label ??
                  String(val))
                : t('filters.selectValue')
            }
          </SelectValue>
        </SelectTrigger>

        <SelectContent>
          {options.map((option) => (
            <SelectItem
              className="h-7 text-xs"
              key={String(option.value)}
              value={String(option.value)}
              data-testid="filter-value-option"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <TextValueInput
      filter={filter}
      operator={operator}
      onValueChange={props.onValueChange}
      onRemove={props.onRemove}
    />
  );
}

/**
 * Campo de texto del valor. Se usa TanStack Form (como el resto de
 * formularios de la web) para validar el formato al pulsar Intro y mostrar el
 * error con `FieldError`; un valor vacío quita el filtro.
 */
function TextValueInput(props: {
  filter: FilterItem;
  operator: string | undefined;
  onValueChange: OnValueChange;
  onRemove: (filter: FilterItem) => void;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { filter, operator } = props;
  const inputConfig = getFilterInputConfig(filter);
  const initialValue = filter.values[0]?.value;

  const form = useForm({
    defaultValues: {
      textValue:
        initialValue === null || initialValue === undefined
          ? ''
          : String(initialValue),
    },
    onSubmit: ({ value }) => {
      const textValue = value.textValue.trim();

      if (textValue) {
        props.onValueChange(
          filter,
          { operator: operator || 'eq', value: textValue },
          true,
        );
      } else {
        props.onRemove(filter);
      }
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field
        name="textValue"
        validators={{
          onSubmit: ({ value }) =>
            !value.trim() ||
            isValidFilterInput(value.trim(), inputConfig, operator)
              ? undefined
              : { message: 'cms.dataExplorer.filters.provideValidFormat' },
        }}
      >
        {(field) => {
          const isInvalid = !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid} className="gap-1">
              <Input
                autoFocus
                name={field.name}
                data-testid="filter-value-input"
                aria-label={filter.display_name || filter.name}
                aria-invalid={isInvalid}
                className="h-7 text-xs"
                type={inputConfig.type}
                placeholder={t(`filters.placeholders.${inputConfig.kind}`)}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />

              {isInvalid ? (
                <FieldError
                  className="text-xs"
                  errors={field.state.meta.errors}
                  params={{
                    type: t(`filters.inputKinds.${inputConfig.kind}`),
                    hint: inputConfig.hint,
                  }}
                />
              ) : (
                <FieldDescription className="text-xs">
                  {t('filters.pressEnterToApply')}
                </FieldDescription>
              )}
            </Field>
          );
        }}
      </form.Field>
    </form>
  );
}
