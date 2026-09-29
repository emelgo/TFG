import { Plus } from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { ColumnMetadata } from '@pymekit/cms-types';
import { Button } from '@pymekit/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@pymekit/ui/command';
import { DataTypeIcon } from '@pymekit/ui/datatype-icon';
import { Popover, PopoverContent, PopoverTrigger } from '@pymekit/ui/popover';

import { useIsNavigating } from './use-is-navigating';

/**
 * Botón «Añadir filtro»: despliega un buscador con las columnas filtrables
 * de la tabla.
 */
export function AddFilterDropdown(props: {
  columns: ColumnMetadata[];
  onSelect: (column: ColumnMetadata) => void;
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const t = useTranslations('cms.dataExplorer');
  const isNavigating = useIsNavigating();

  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange} modal>
      <PopoverTrigger
        render={
          <Button
            disabled={isNavigating || props.columns.length === 0}
            data-testid="add-filter-button"
            variant="outline"
            className="hover:border-primary active:bg-muted aria-[expanded=true]:border-primary gap-x-1 border-dashed"
            size="sm"
          />
        }
      >
        <span>{t('filters.addFilter')}</span>
        <Plus className="h-3 w-3" />
      </PopoverTrigger>

      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput
            data-testid="filter-column-search"
            placeholder={t('filters.typeFilterName')}
          />

          <CommandList>
            <CommandEmpty>{t('filters.noFiltersFound')}</CommandEmpty>

            <CommandGroup className="max-h-[40vh] overflow-y-auto">
              {props.columns.map((column) => (
                <CommandItem
                  key={column.name}
                  value={column.display_name ?? column.name}
                  data-testid="filter-column-option"
                  data-column={column.name}
                  className="flex cursor-pointer items-center gap-x-2.5"
                  onSelect={() => props.onSelect(column)}
                >
                  <DataTypeIcon
                    className="text-muted-foreground h-3 w-3"
                    type={column.ui_config.data_type}
                  />

                  <span>{column.display_name ?? column.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
