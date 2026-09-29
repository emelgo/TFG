/**
 * Selector del valor de una clave foránea en el formulario de un registro.
 *
 * En lugar de pedir el identificador de la fila relacionada (un UUID, por
 * ejemplo), abre un buscador sobre la tabla destino con la misma consulta y
 * caché que el listado (`queries.tableData`, que vuelve a comprobar el
 * permiso `select`): sin texto muestra la primera página y, al escribir,
 * busca con la búsqueda global de la tabla. Cada fila se muestra con el
 * formato de visualización de esa tabla (`display_format`).
 *
 * Si el usuario no puede leer la tabla destino (la API responde 403, o es
 * de un esquema protegido como `auth.users`, que el explorador nunca lee) no
 * hay nada que buscar: el campo pasa a ser un texto normal donde escribir el
 * valor, y la base de datos comprobará que existe (clave foránea).
 */
import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { ChevronsUpDownIcon, SearchIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { isProtectedSchema } from '@pymekit/cms-data-explorer-core/protected-schemas';
import { useDebouncedValue } from '@pymekit/cms-filters/hooks';
import { formatRecord } from '@pymekit/cms-formatters';
import type { RelationConfig } from '@pymekit/cms-types';
import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { getCmsAccessFailure } from '@pymekit/cms-ui-core/errors';
import { Button } from '@pymekit/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@pymekit/ui/command';
import { Input } from '@pymekit/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@pymekit/ui/popover';

const PAGE_SIZE = 10;

export function RelationFieldPicker(props: {
  id: string;
  value: string;
  relation: RelationConfig;
  /** Etiqueta ya conocida del valor inicial (fila de la clave foránea). */
  initialLabel?: string | null;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { queries } = useCmsApi();
  const { relation, value } = props;

  const readable = !isProtectedSchema(relation.target_schema);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const debouncedQuery = useDebouncedValue(input.trim(), 300);

  const options = useQuery({
    ...queries.tableData({
      schema: relation.target_schema,
      table: relation.target_table,
      search: debouncedQuery || undefined,
      pageSize: PAGE_SIZE,
    }),
    enabled: open && readable,
  });

  // Etiqueta del valor actual: la que ya trae la ficha para el valor inicial
  // o, si se ha cambiado, la de la fila elegida (se pide filtrando por ella).
  const selected = useQuery({
    ...queries.tableData({
      schema: relation.target_schema,
      table: relation.target_table,
      pageSize: 1,
      filters: { [`${relation.target_column}.eq`]: value },
    }),
    enabled: readable && value !== '' && !props.initialLabel,
  });

  if (
    !readable ||
    getCmsAccessFailure(options.error) === 'forbidden' ||
    getCmsAccessFailure(selected.error) === 'forbidden'
  ) {
    return (
      <Input
        id={props.id}
        value={value}
        disabled={props.disabled}
        aria-invalid={props.invalid}
        placeholder={props.placeholder}
        data-testid="record-field-input"
        onBlur={props.onBlur}
        onChange={(event) => props.onChange(event.target.value)}
      />
    );
  }

  const toOption = (
    row: Record<string, unknown>,
    displayFormat: string | null | undefined,
  ) => {
    const optionValue = row[relation.target_column];
    const text =
      optionValue === null || optionValue === undefined
        ? ''
        : String(optionValue);

    return {
      value: text,
      label: (displayFormat && formatRecord(displayFormat, row)) || text,
    };
  };

  const selectedRow = selected.data?.data[0];

  const label =
    value === ''
      ? ''
      : props.initialLabel ||
        (selectedRow
          ? toOption(selectedRow, selected.data?.table.displayFormat).label
          : value);

  const items = (options.data?.data ?? [])
    .map((row) => toOption(row, options.data?.table.displayFormat))
    .filter((option) => option.value !== '');

  return (
    <div className="flex w-full items-center gap-1">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);

          if (!next) {
            setInput('');
            props.onBlur?.();
          }
        }}
      >
        <PopoverTrigger
          render={
            <Button
              id={props.id}
              type="button"
              variant="outline"
              disabled={props.disabled}
              aria-invalid={props.invalid}
              data-testid="record-field-relation-picker"
              className="flex min-w-0 flex-1 justify-between gap-2 bg-transparent px-2.5 font-normal"
            />
          }
        >
          <span className="flex min-w-0 items-center gap-2">
            <SearchIcon className="h-3 w-3 shrink-0" />

            <span className="truncate" data-testid="relation-picker-value">
              {label || (
                <span className="text-muted-foreground">
                  {t('record.form.pickRecord')}
                </span>
              )}
            </span>
          </span>

          <ChevronsUpDownIcon className="h-3 w-3 shrink-0" />
        </PopoverTrigger>

        <PopoverContent align="start" className="w-96 p-0">
          <Command shouldFilter={false}>
            <CommandInput
              data-testid="relation-picker-search"
              placeholder={t('filters.search')}
              value={input}
              onValueChange={setInput}
            />

            <CommandList>
              {options.isPending || input.trim() !== debouncedQuery ? (
                <div className="text-muted-foreground p-2 text-xs">
                  {t('filters.loading')}
                </div>
              ) : options.isError || items.length === 0 ? (
                <CommandEmpty className="text-muted-foreground p-2 text-xs">
                  {t('filters.noResultsFound')}
                </CommandEmpty>
              ) : (
                <CommandGroup>
                  {items.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      data-testid="relation-picker-option"
                      data-value={option.value}
                      className="cursor-pointer"
                      onSelect={() => {
                        props.onChange(option.value);
                        setOpen(false);
                        setInput('');
                      }}
                    >
                      <span className="truncate">{option.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value !== '' && !props.disabled ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t('record.form.clearValue')}
          data-testid="relation-picker-clear"
          onClick={() => props.onChange('')}
        >
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
