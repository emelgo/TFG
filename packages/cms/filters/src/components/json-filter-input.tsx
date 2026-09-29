/**
 * Filtro para columnas JSON/JSONB, con tres modos:
 *
 *  - **Texto** (`containsText`): busca el texto en cualquier parte del JSON.
 *  - **Clave-valor** (`keyEquals`): la clave indicada tiene exactamente ese
 *    valor. Viaja como `clave:valor`.
 *  - **Ruta** (`pathExists`): existe la ruta JSONPath indicada (`$.a.b`).
 *
 * La validación de aquí es solo de formato, para dar un aviso inmediato; el
 * servidor vuelve a validar y construye la consulta con parámetros enlazados.
 */
import { useState } from 'react';

import { useTranslations } from 'use-intl';

import { Button } from '@pymekit/ui/button';
import { Input } from '@pymekit/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@pymekit/ui/select';
import { cn } from '@pymekit/ui/utils';

import type { FilterItem, FilterOperator, FilterValue } from '../types';
import { validateJsonFilterValue } from '../utils/json-filter';

type JsonMode = 'simple' | 'keyValue' | 'path';

type JsonFilterState = {
  operator: FilterOperator;
  simpleSearch: string;
  jsonKey: string;
  jsonValue: string;
  jsonPath: string;
  /** Clave i18n del error de validación (`filters.jsonErrors.*`). */
  validationError: string | null;
};

const JSON_OPERATORS: FilterOperator[] = [
  'containsText',
  'keyEquals',
  'pathExists',
  'hasKey',
];

function getMode(operator: FilterOperator): JsonMode {
  switch (operator) {
    case 'keyEquals':
      return 'keyValue';
    case 'pathExists':
      return 'path';
    default:
      return 'simple';
  }
}

/** Estado inicial a partir del valor aplicado (si lo hay). */
function getInitialState(
  filter: FilterItem,
  currentOperator: FilterOperator | null,
): JsonFilterState {
  const currentValue = filter.values[0]?.value;

  const operator =
    currentOperator && JSON_OPERATORS.includes(currentOperator)
      ? currentOperator
      : 'containsText';

  const empty = {
    operator,
    simpleSearch: '',
    jsonKey: '',
    jsonValue: '',
    jsonPath: '',
    validationError: null,
  };

  if (!currentValue || typeof currentValue !== 'string') {
    return empty;
  }

  switch (operator) {
    case 'keyEquals': {
      const [key = '', ...rest] = currentValue.split(':');

      return {
        ...empty,
        jsonKey: key.trim(),
        jsonValue: rest.join(':').trim(),
      };
    }

    case 'pathExists':
      return { ...empty, jsonPath: currentValue };

    default:
      return { ...empty, simpleSearch: currentValue };
  }
}

export function JsonFilterInput({
  filter,
  currentOperator,
  onValueChange,
}: {
  filter: FilterItem;
  currentOperator: FilterOperator | null;
  onValueChange: (
    filter: FilterItem,
    value: FilterValue,
    shouldClose?: boolean,
  ) => void;
}) {
  const t = useTranslations('cms.dataExplorer');

  const [state, setState] = useState(() =>
    getInitialState(filter, currentOperator),
  );

  const mode = getMode(state.operator);

  const updateState = (updates: Partial<JsonFilterState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const applyFilter = (operator: FilterOperator, value: string) => {
    const error = validateJsonFilterValue(operator, value);

    if (error) {
      updateState({ validationError: error });
      return;
    }

    updateState({ validationError: null, operator });
    onValueChange(filter, { operator, value }, true);
  };

  const modeSelector = (
    <Select
      value={mode}
      onValueChange={(next) => {
        const operator: FilterOperator =
          next === 'keyValue'
            ? 'keyEquals'
            : next === 'path'
              ? 'pathExists'
              : 'containsText';

        // Al cambiar de modo se vacían los campos: el formato del valor es
        // distinto en cada uno.
        setState({
          operator,
          simpleSearch: '',
          jsonKey: '',
          jsonValue: '',
          jsonPath: '',
          validationError: null,
        });
      }}
    >
      <SelectTrigger className="h-7 text-xs" data-testid="json-mode-select">
        <SelectValue>
          {(val) => t(`filters.jsonModes.${String(val) as JsonMode}`)}
        </SelectValue>
      </SelectTrigger>

      <SelectContent>
        <SelectGroup>
          <SelectItem value="simple" className="text-xs">
            {t('filters.jsonModes.simple')}
          </SelectItem>
        </SelectGroup>

        <SelectGroup>
          <SelectLabel>{t('filters.jsonModes.advanced')}</SelectLabel>

          <SelectItem value="keyValue" className="text-xs">
            {t('filters.jsonModes.keyValue')}
          </SelectItem>

          <SelectItem value="path" className="text-xs">
            {t('filters.jsonModes.path')}
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );

  const errorMessage = state.validationError ? (
    <div className="text-destructive py-0.5 text-xs font-medium">
      {t(state.validationError)}
    </div>
  ) : null;

  if (mode === 'keyValue') {
    const keyValue = `${state.jsonKey}:${state.jsonValue}`;

    return (
      <div className="space-y-2">
        {modeSelector}

        <Input
          data-testid="json-key-input"
          className="h-7 text-xs"
          value={state.jsonKey}
          aria-label={t('filters.jsonPlaceholders.key')}
          placeholder={t('filters.jsonPlaceholders.key')}
          onChange={(e) =>
            updateState({ jsonKey: e.target.value, validationError: null })
          }
        />

        <Input
          data-testid="json-value-input"
          className="h-7 text-xs"
          value={state.jsonValue}
          aria-label={t('filters.jsonPlaceholders.value')}
          placeholder={t('filters.jsonPlaceholders.value')}
          onChange={(e) =>
            updateState({ jsonValue: e.target.value, validationError: null })
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter' && state.jsonKey && state.jsonValue) {
              applyFilter('keyEquals', keyValue);
            }
          }}
        />

        <Button
          size="sm"
          className="w-full"
          data-testid="json-apply-button"
          disabled={!state.jsonKey || !state.jsonValue}
          onClick={() => applyFilter('keyEquals', keyValue)}
        >
          {t('filters.apply')}
        </Button>

        {errorMessage}
      </div>
    );
  }

  if (mode === 'path') {
    return (
      <div className="space-y-2">
        {modeSelector}

        <Input
          data-testid="json-path-input"
          className={cn('h-7 font-mono text-xs', {
            'border-destructive': state.validationError,
          })}
          value={state.jsonPath}
          aria-label={t('filters.jsonModes.path')}
          placeholder={t('filters.jsonPlaceholders.path')}
          onChange={(e) =>
            updateState({ jsonPath: e.target.value, validationError: null })
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter' && state.jsonPath) {
              applyFilter('pathExists', state.jsonPath);
            }
          }}
        />

        <Button
          size="sm"
          className="w-full"
          data-testid="json-apply-button"
          disabled={!state.jsonPath}
          onClick={() => applyFilter('pathExists', state.jsonPath)}
        >
          {t('filters.apply')}
        </Button>

        {errorMessage}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {modeSelector}

      <Input
        data-testid="json-simple-search"
        className={cn('h-7 text-xs', {
          'border-destructive': state.validationError,
        })}
        value={state.simpleSearch}
        aria-label={t('filters.jsonModes.simple')}
        placeholder={t('filters.jsonPlaceholders.simple')}
        onChange={(e) =>
          updateState({ simpleSearch: e.target.value, validationError: null })
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter' && state.simpleSearch.trim()) {
            applyFilter(state.operator, state.simpleSearch.trim());
          }
        }}
      />

      <Button
        size="sm"
        className="w-full"
        data-testid="json-apply-button"
        disabled={!state.simpleSearch.trim()}
        onClick={() => applyFilter(state.operator, state.simpleSearch.trim())}
      >
        {t('filters.apply')}
      </Button>

      {errorMessage}
    </div>
  );
}
