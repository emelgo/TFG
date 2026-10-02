/**
 * Gestión de columnas del listado: mostrar u ocultar, fijar a la izquierda y
 * cambiar el orden. Son preferencias del usuario en este navegador (ver
 * `useColumnPreferences`); solo se ofrecen las columnas que el metadato de la
 * tabla permite ver en el listado.
 */
import {
  ArrowDown,
  ArrowUp,
  Columns,
  Eye,
  EyeOff,
  Pin,
  PinOff,
} from 'lucide-react';
import { useTranslations } from 'use-intl';

import {
  type ColumnManagementState,
  sortTableColumns,
} from '@pymekit/cms-table/components';
import type { ColumnMetadata } from '@pymekit/cms-types';
import { Button } from '@pymekit/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@pymekit/ui/popover';
import { Separator } from '@pymekit/ui/separator';
import { cn } from '@pymekit/ui/utils';

export function ColumnManagementPopover({
  columns,
  columnManagement,
}: {
  columns: ColumnMetadata[];
  columnManagement: ColumnManagementState;
}) {
  const t = useTranslations('cms.dataExplorer');

  const tableColumns = sortTableColumns(
    columns.filter((col) => col.is_visible_in_table),
    columnManagement.columnOrder,
  );

  const { columnVisibility, columnPinning } = columnManagement;

  const visibleCount = tableColumns.filter(
    (col) => columnVisibility[col.name] !== false,
  ).length;

  const pinnedCount =
    (columnPinning.left?.length ?? 0) + (columnPinning.right?.length ?? 0);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="relative h-6 w-6 p-0"
            data-testid="column-management-trigger"
            aria-label={t('columns.title')}
          />
        }
      >
        <Columns className="h-3.5 w-3.5" />
      </PopoverTrigger>

      <PopoverContent
        className="w-80 p-0"
        align="end"
        data-testid="column-management-popover"
      >
        <div className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium">{t('columns.title')}</h4>

              <p className="text-muted-foreground text-xs">
                {t('columns.summary', {
                  visible: visibleCount,
                  total: tableColumns.length,
                  pinned: pinnedCount,
                })}
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              data-testid="column-management-reset"
              onClick={columnManagement.resetPreferences}
              className="h-6 px-2 text-xs"
            >
              {t('columns.reset')}
            </Button>
          </div>

          <Separator className="mb-2" />

          {tableColumns.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">
              <Columns className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p className="text-sm">{t('columns.empty')}</p>
            </div>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {tableColumns.map((column, index) => {
                const name = column.display_name || column.name;
                const isVisible = columnVisibility[column.name] !== false;
                const pinnedSide = columnManagement.isColumnPinned(column.name);

                return (
                  <li
                    key={column.name}
                    data-testid="column-management-item"
                    data-column={column.name}
                    className={cn(
                      'hover:bg-muted/50 flex items-center justify-between rounded-md px-2 py-1.5 transition-colors',
                      pinnedSide &&
                        'bg-muted/30 border-muted-foreground/20 border',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate text-sm',
                          !isVisible && 'text-muted-foreground line-through',
                        )}
                      >
                        {name}
                      </span>

                      {pinnedSide && (
                        <span className="text-muted-foreground text-xs">
                          {t(`columns.pinned.${pinnedSide}`)}
                        </span>
                      )}
                    </div>

                    <div className="ml-2 flex items-center gap-x-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        disabled={index === 0}
                        aria-label={t('columns.moveUp', { name })}
                        data-testid={`move-up-${column.name}`}
                        onClick={() =>
                          columnManagement.moveColumn(column.name, 'up')
                        }
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        disabled={index === tableColumns.length - 1}
                        aria-label={t('columns.moveDown', { name })}
                        data-testid={`move-down-${column.name}`}
                        onClick={() =>
                          columnManagement.moveColumn(column.name, 'down')
                        }
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        aria-label={
                          isVisible
                            ? t('columns.hide', { name })
                            : t('columns.show', { name })
                        }
                        aria-pressed={!isVisible}
                        data-testid={`visibility-toggle-${column.name}`}
                        onClick={() =>
                          columnManagement.toggleColumnVisibility(column.name)
                        }
                      >
                        {isVisible ? (
                          <Eye className="h-3 w-3" />
                        ) : (
                          <EyeOff className="text-muted-foreground h-3 w-3" />
                        )}
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          'h-6 w-6 p-0',
                          pinnedSide && 'text-primary',
                        )}
                        disabled={!isVisible}
                        aria-label={
                          pinnedSide
                            ? t('columns.unpin', { name })
                            : t('columns.pin', { name })
                        }
                        aria-pressed={Boolean(pinnedSide)}
                        data-testid={`pin-toggle-${column.name}`}
                        onClick={() =>
                          columnManagement.toggleColumnPin(column.name, 'left')
                        }
                      >
                        {pinnedSide ? (
                          <Pin className="h-3 w-3" />
                        ) : (
                          <PinOff className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
