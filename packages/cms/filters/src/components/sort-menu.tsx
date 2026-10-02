import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  SortAscIcon,
  SortDescIcon,
  XIcon,
} from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { ColumnMetadata } from '@pymekit/cms-types';
import { Button } from '@pymekit/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@pymekit/ui/dropdown-menu';
import { cn } from '@pymekit/ui/utils';

import type { SortDirection, SortState } from '../types';

/**
 * Menú de ordenación: lista las columnas ordenables; al elegir la que ya está
 * activa se invierte el sentido.
 */
export function SortMenu({
  columns,
  currentSort,
  onSortChange,
  onClearSort,
}: {
  columns: ColumnMetadata[];
  currentSort: SortState & { columnName: string | undefined | null };
  onSortChange: (column: string, direction: SortDirection) => void;
  onClearSort: () => void;
}) {
  const t = useTranslations('cms.dataExplorer');

  if (columns.length === 0) {
    return null;
  }

  const isSorted = Boolean(currentSort.column && currentSort.direction);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            data-testid="sort-menu-button"
            data-test-column={currentSort.column ?? undefined}
            data-test-direction={currentSort.direction ?? undefined}
            size="sm"
            variant="outline"
            className={cn('m-0 h-6 gap-x-1 px-2 py-0 shadow-none', {
              'border-primary': isSorted,
            })}
          />
        }
      >
        <span className="flex items-center gap-x-1">
          <ArrowUpDownIcon
            className={cn('h-3 w-3', { 'text-primary': isSorted })}
          />

          <span>
            {isSorted
              ? t('filters.sortBy', { column: currentSort.columnName ?? '' })
              : t('filters.sort')}
          </span>

          {currentSort.direction === 'desc' ? (
            <SortDescIcon className="h-3 w-3" />
          ) : (
            <SortAscIcon className="h-3 w-3" />
          )}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="max-h-[50vh] min-w-64 overflow-y-auto pb-0"
      >
        {columns.map((column) => {
          const isActive = currentSort.column === column.name;

          return (
            <DropdownMenuItem
              data-testid="sort-column-option"
              data-column={column.name}
              key={column.name}
              className={cn(
                'group/item flex cursor-pointer justify-between text-xs',
                {
                  'text-primary hover:text-primary hover:border-primary hover:bg-muted border':
                    isActive,
                },
              )}
              onClick={() =>
                onSortChange(
                  column.name,
                  isActive && currentSort.direction === 'asc' ? 'desc' : 'asc',
                )
              }
            >
              <span>{column.display_name || column.name}</span>

              <span className="flex items-center transition-all group-hover/item:-rotate-180">
                {isActive &&
                  (currentSort.direction === 'asc' ? (
                    <ArrowUpIcon className="h-3 w-3" />
                  ) : (
                    <ArrowDownIcon className="h-3 w-3" />
                  ))}
              </span>
            </DropdownMenuItem>
          );
        })}

        {isSorted && (
          <div className="bg-popover/80 sticky bottom-0 z-10 mt-1 h-8 border-t py-0.5 backdrop-blur-sm">
            <DropdownMenuItem
              onClick={onClearSort}
              className="text-xs"
              data-testid="clear-sort-button"
            >
              <XIcon className="mr-1 h-3 w-3" />
              <span>{t('filters.clearSort')}</span>
            </DropdownMenuItem>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
