import { X } from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { ColumnMetadata } from '@pymekit/cms-types';
import { Button } from '@pymekit/ui/button';
import { If } from '@pymekit/ui/if';

import type { FilterItem, FilterValue } from '../types';
import { FilterBadge } from './filter-badge';
import { useIsNavigating } from './use-is-navigating';

/**
 * Lista de filtros aplicados (y en edición) y el botón «Limpiar filtros»,
 * que aparece si hay algún filtro o una búsqueda activa.
 */
export function FiltersList(props: {
  filters: FilterItem[];
  hasSearch: boolean;
  onRemove: (column: ColumnMetadata) => void;
  onValueChange: (
    column: ColumnMetadata,
    value: FilterValue,
    shouldClose?: boolean,
  ) => void;
  onOpenChange: (filterName: string, isOpen: boolean) => void;
  onClearFilters: () => void;
  openFilterName: string | null;
}) {
  const t = useTranslations('cms.dataExplorer');
  const isNavigating = useIsNavigating();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {props.filters.map((filter) => (
        <FilterBadge
          key={filter.name}
          filter={filter}
          onRemove={props.onRemove}
          onValueChange={props.onValueChange}
          onOpenChange={props.onOpenChange}
          openFilterName={props.openFilterName}
        />
      ))}

      <If condition={props.filters.length > 0 || props.hasSearch}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="clear-all-filters-button"
          className="animate-in fade-in zoom-in-95 flex h-6 items-center gap-x-1"
          disabled={isNavigating}
          onClick={props.onClearFilters}
        >
          <X className="h-3 w-3" />

          <span className="text-xs font-normal">
            {t('filters.clearFilters')}
          </span>
        </Button>
      </If>
    </div>
  );
}
