/**
 * Tabla de datos del explorador del CMS.
 *
 * Construye las columnas de TanStack Table a partir del metadato de la tabla
 * (`cms.table_metadata`: qué columnas se ven en el listado, en qué orden, con
 * qué nombre y si se pueden ordenar) y delega el pintado en la tabla genérica
 * de `@pymekit/ui/enhanced-data-table`, que ya resuelve la paginación, las
 * columnas fijadas y el clic en la fila.
 *
 * Es un componente de presentación con inversión de control: no sabe de URL
 * ni de API. Quien lo usa le inyecta el estado de ordenación y paginación, las
 * preferencias de columnas y el componente que pinta cada celda
 * (`CellRenderer`), de modo que la misma tabla sirve para el explorador de
 * datos y para otras pantallas del CMS.
 *
 * La ordenación es del servidor: la cabecera solo avisa con `onSortChange` y
 * la tabla no reordena las filas por su cuenta.
 *
 * Opcionalmente añade una columna de selección (casillas, fijada a la
 * izquierda) cuyo estado también gestiona quien usa la tabla (`selection`):
 * la tabla no decide qué se puede seleccionar ni qué se hace con ello.
 */
import { useMemo } from 'react';

import type {
  CellContext,
  ColumnDef,
  ColumnPinningState,
  Row,
  VisibilityState,
} from '@tanstack/react-table';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { ColumnMetadata, RelationConfig } from '@pymekit/cms-types';
import { Button } from '@pymekit/ui/button';
import { Checkbox } from '@pymekit/ui/checkbox';
import { DataTable } from '@pymekit/ui/enhanced-data-table';
import { cn } from '@pymekit/ui/utils';

import { sortTableColumns } from '../utils/sort-table-columns';

type DataItem = Record<string, unknown>;

/** Identificador de la columna de selección de filas. */
const SELECT_COLUMN_ID = '__select';

/** Etiqueta y enlace de la fila relacionada de una celda de clave foránea. */
export interface RelationData {
  column: string;
  original: unknown;
  formatted: string | null | undefined;
  link: string | null | undefined;
}

/**
 * Preferencias de columnas (visibles y fijadas) que gestiona quien usa la
 * tabla; ver `useColumnPreferences` en el explorador de datos.
 */
export interface ColumnManagementState {
  columnVisibility: VisibilityState;
  columnPinning: ColumnPinningState;
  columnOrder: string[];
  toggleColumnVisibility: (columnId: string) => void;
  toggleColumnPin: (columnId: string, side?: 'left' | 'right') => void;
  isColumnPinned: (columnId: string) => 'left' | 'right' | false;
  moveColumn: (columnId: string, direction: 'up' | 'down') => void;
  resetPreferences: () => void;
}

/** Propiedades que recibe el componente que pinta cada celda. */
export interface CellRendererProps {
  column: ColumnMetadata;
  value: unknown;
  /** Fila completa a la que pertenece la celda (p. ej., para editarla). */
  record: Record<string, unknown>;
  relationConfig?: RelationConfig;
  relation?: RelationData;
}

/**
 * Estado de la selección de filas, gestionado fuera de la tabla. Si se pasa,
 * la tabla añade una primera columna con casillas.
 */
export interface RowSelectionState<RecordData extends DataItem> {
  /** `false` si la fila no se puede seleccionar (sin clave que la identifique). */
  canSelect: (record: RecordData) => boolean;
  isSelected: (record: RecordData) => boolean;
  toggle: (record: RecordData) => void;
  /** Estado de la casilla de la cabecera para la página visible. */
  pageState: 'none' | 'some' | 'all';
  togglePage: (selected: boolean) => void;
}

export interface AdvancedDataTableProps<RecordData extends DataItem> {
  columns: ColumnMetadata[];
  data: RecordData[];

  pagination: {
    pageIndex: number;
    pageSize: number;
    pageCount: number;
  };

  onPaginationChange?: (pagination: {
    pageIndex: number;
    pageSize: number;
  }) => void;

  columnManagement?: ColumnManagementState;

  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSortChange?: (column: string) => void;

  /** Devuelve la etiqueta de la fila relacionada para una celda. */
  buildRelationLink?: (
    record: RecordData,
    column: string,
  ) => RelationData | undefined;

  CellRenderer?: React.ComponentType<CellRendererProps>;

  relationsConfig?: RelationConfig[];

  selection?: RowSelectionState<RecordData>;

  className?: string;
  onRowClick?: (row: Row<RecordData>) => void;
  sticky?: boolean;
  noResultsMessage?: React.ReactNode;
  tableProps?: Record<`data-${string}`, string>;
}

export function AdvancedDataTable<RecordData extends DataItem>(
  props: AdvancedDataTableProps<RecordData>,
) {
  const {
    columns,
    columnManagement,
    sortColumn,
    sortDirection,
    onSortChange,
    buildRelationLink,
    CellRenderer,
    relationsConfig = [],
    selection,
  } = props;

  const t = useTranslations('cms.dataExplorer');

  const tableColumns = useMemo(() => {
    const visible = columns
      .filter((col) => col.is_visible_in_table)
      .filter((col) =>
        columnManagement
          ? columnManagement.columnVisibility[col.name] !== false
          : true,
      );

    const dataColumns = sortTableColumns(
      visible,
      columnManagement?.columnOrder,
    ).map((col): ColumnDef<RecordData> => ({
      id: col.name,
      accessorKey: col.name,
      enablePinning: true,
      // La ordenación la hace el servidor: la cabecera propia de abajo
      // avisa con `onSortChange` y la tabla no reordena en el cliente.
      enableSorting: false,
      header: () => {
        const label = col.display_name ?? col.name;

        if (!col.is_sortable || !onSortChange) {
          return <span>{label}</span>;
        }

        const isSorted = sortColumn === col.name;

        return (
          <Button
            variant="ghost"
            size="sm"
            data-testid="column-sort-button"
            data-column={col.name}
            data-sort-direction={isSorted ? sortDirection : undefined}
            className="h-5 gap-x-1 p-0 font-medium hover:bg-transparent"
            onClick={() => onSortChange(col.name)}
          >
            <span>{label}</span>

            {isSorted && (
              <span className="flex flex-col">
                <ChevronUp
                  className={cn(
                    'h-3 w-3',
                    sortDirection === 'asc'
                      ? 'text-foreground'
                      : 'text-muted-foreground/50',
                  )}
                />
                <ChevronDown
                  className={cn(
                    '-mt-1 h-3 w-3',
                    sortDirection === 'desc'
                      ? 'text-foreground'
                      : 'text-muted-foreground/50',
                  )}
                />
              </span>
            )}
          </Button>
        );
      },
      cell: ({ row }: CellContext<RecordData, unknown>) => {
        const value = row.original[col.name];

        if (!CellRenderer) {
          return (
            <span className="text-muted-foreground block w-max max-w-48 truncate text-xs">
              {value === null || value === undefined ? '—' : String(value)}
            </span>
          );
        }

        return (
          <CellRenderer
            column={col}
            value={value}
            record={row.original}
            relation={buildRelationLink?.(row.original, col.name)}
            relationConfig={relationsConfig.find(
              (relation) => relation.source_column === col.name,
            )}
          />
        );
      },
    }));

    if (!selection) {
      return dataColumns;
    }

    // Columna de selección. El clic en la casilla no debe llegar a la celda:
    // la fila navegaría a la ficha del registro.
    const selectColumn: ColumnDef<RecordData> = {
      id: SELECT_COLUMN_ID,
      size: 40,
      enableSorting: false,
      enablePinning: true,
      header: () => (
        <span
          className="flex items-center"
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            data-testid="select-all-rows"
            aria-label={t('table.selectPage')}
            checked={selection.pageState === 'all'}
            indeterminate={selection.pageState === 'some'}
            onCheckedChange={(checked) => selection.togglePage(checked)}
          />
        </span>
      ),
      cell: ({ row }: CellContext<RecordData, unknown>) =>
        selection.canSelect(row.original) ? (
          <span
            className="flex items-center"
            onClick={(event) => event.stopPropagation()}
          >
            <Checkbox
              data-testid="select-row"
              aria-label={t('table.selectRow')}
              checked={selection.isSelected(row.original)}
              onCheckedChange={() => selection.toggle(row.original)}
            />
          </span>
        ) : null,
    };

    return [selectColumn, ...dataColumns];
  }, [
    selection,
    t,
    columns,
    columnManagement,
    sortColumn,
    sortDirection,
    onSortChange,
    buildRelationLink,
    CellRenderer,
    relationsConfig,
  ]);

  const { onRowClick } = props;

  // La columna de selección va siempre fijada a la izquierda, delante de las
  // que haya fijado el usuario.
  const columnPinning = useMemo(() => {
    const pinning = columnManagement?.columnPinning;

    if (!selection) {
      return pinning;
    }

    return {
      left: [
        SELECT_COLUMN_ID,
        ...(pinning?.left ?? []).filter((id) => id !== SELECT_COLUMN_ID),
      ],
      right: pinning?.right ?? [],
    };
  }, [columnManagement?.columnPinning, selection]);

  return (
    <DataTable<RecordData>
      sticky={props.sticky}
      className={props.className}
      columns={tableColumns}
      data={props.data}
      pageIndex={props.pagination.pageIndex}
      pageSize={props.pagination.pageSize}
      pageCount={props.pagination.pageCount}
      onPaginationChange={props.onPaginationChange}
      columnVisibility={columnManagement?.columnVisibility}
      columnPinning={columnPinning}
      onClick={onRowClick ? ({ row }) => onRowClick(row) : undefined}
      noResultsMessage={props.noResultsMessage}
      tableProps={props.tableProps}
    />
  );
}
