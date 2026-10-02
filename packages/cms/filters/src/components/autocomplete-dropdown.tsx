/**
 * Autocompletado del valor de un filtro de clave foránea.
 *
 * En lugar de pedir al usuario que escriba el identificador de la fila
 * relacionada (un UUID, por ejemplo), busca en la tabla destino con la
 * búsqueda global de la API y muestra cada fila con el formato de
 * visualización de esa tabla (`display_format`, p. ej. `{name} - {email}`).
 * Al elegir una, el filtro guarda el valor de la columna destino y la
 * etiqueta legible.
 *
 * La búsqueda espera 400 ms desde la última tecla (`useDebouncedValue`) y
 * reutiliza la consulta `tableData` de TanStack Query, así que las búsquedas
 * repetidas salen de la caché.
 */
import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { formatRecord } from '@pymekit/cms-formatters';
import type { RelationConfig } from '@pymekit/cms-types';
import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@pymekit/ui/command';

import { useDebouncedValue } from '../hooks/use-debounced-value';

const MIN_QUERY_LENGTH = 2;
const PAGE_SIZE = 10;

export function AutocompleteDropdown({
  onChange,
  relation,
}: {
  onChange: (value: string, label: string | undefined) => void;
  relation: RelationConfig;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { queries } = useCmsApi();

  const [input, setInput] = useState('');
  const query = input.trim();
  const debouncedQuery = useDebouncedValue(query, 400);

  const { data, isFetching, isError } = useQuery({
    ...queries.tableData({
      schema: relation.target_schema,
      table: relation.target_table,
      search: debouncedQuery,
      pageSize: PAGE_SIZE,
    }),
    enabled: debouncedQuery.length >= MIN_QUERY_LENGTH,
  });

  const displayFormat = data?.table.displayFormat;

  const options = (data?.data ?? []).map((item) => {
    const value = item[relation.target_column];

    return {
      value: value === null || value === undefined ? '' : String(value),
      label: displayFormat
        ? (formatRecord(displayFormat, item) ?? String(value))
        : String(value),
    };
  });

  const isWaiting =
    query.length >= MIN_QUERY_LENGTH &&
    (isFetching || query !== debouncedQuery);

  return (
    <Command shouldFilter={false}>
      <CommandInput
        data-testid="autocomplete-input"
        placeholder={t('filters.search')}
        className="h-8 min-w-[200px] text-xs"
        value={input}
        onValueChange={setInput}
      />

      <CommandList>
        {isWaiting ? (
          <div className="text-muted-foreground p-2 text-xs">
            {t('filters.loading')}
          </div>
        ) : query.length < MIN_QUERY_LENGTH ? (
          <div className="text-muted-foreground p-2 text-xs">
            {t('filters.enterSearchQuery')}
          </div>
        ) : isError || options.length === 0 ? (
          <CommandEmpty className="text-muted-foreground p-2 text-xs">
            {t('filters.noResultsFound')}
          </CommandEmpty>
        ) : (
          <CommandGroup className="mt-2 p-0">
            {options.map((option) => (
              <CommandItem
                key={option.value}
                value={option.value}
                data-testid="autocomplete-option"
                className="cursor-pointer text-xs"
                onSelect={() => onChange(option.value, option.label)}
              >
                {option.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}
