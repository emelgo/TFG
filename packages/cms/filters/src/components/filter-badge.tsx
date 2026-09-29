import { X } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { Badge } from '@pymekit/ui/badge';
import { Button } from '@pymekit/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@pymekit/ui/popover';

import {
  useFilterLabelFormatters,
  useFilterOptions,
  useFormatDateForDisplay,
} from '../hooks/use-filter-labels';
import type { FilterItem, FilterValue } from '../types';
import { getFilterDisplayValue } from '../utils/filter-label';
import { FilterContent } from './filter-content';
import { useIsNavigating } from './use-is-navigating';

/**
 * «Píldora» de un filtro: muestra su resumen y, al pulsarla, abre el
 * desplegable para cambiar el operador o el valor. La «x» lo quita.
 */
export function FilterBadge({
  filter,
  onRemove,
  onValueChange,
  onOpenChange,
  openFilterName,
}: {
  filter: FilterItem;
  onRemove: (filter: FilterItem) => void;
  onValueChange: (
    filter: FilterItem,
    value: FilterValue,
    shouldClose?: boolean,
  ) => void;
  onOpenChange: (filterName: string, isOpen: boolean) => void;
  openFilterName: string | null;
}) {
  const t = useTranslations('cms.dataExplorer');
  const formatDate = useFormatDateForDisplay();
  const { formatRelativeDate } = useFilterLabelFormatters();
  const options = useFilterOptions(filter);
  const isNavigating = useIsNavigating();

  const label = getFilterDisplayValue(filter, {
    t: (key, values) => t(key, values),
    formatDate,
    formatRelativeDate,
    options,
  });

  return (
    <Popover
      open={openFilterName === filter.name}
      onOpenChange={(isOpen) => onOpenChange(filter.name, isOpen)}
      modal
    >
      <PopoverTrigger
        disabled={isNavigating}
        nativeButton={false}
        render={
          <Badge
            role="button"
            tabIndex={0}
            variant="outline"
            data-testid="filter-badge"
            data-filter-column={filter.name}
            className="hover:border-primary/40 active:bg-muted focus:border-primary h-6 cursor-default rounded-lg px-2 py-1 outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                (e.target as HTMLElement).click();
              }
            }}
          />
        }
      >
        <span className="flex items-center gap-1">
          <span className="font-normal">{label}</span>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="remove-filter-button"
            aria-label={t('filters.removeFilter')}
            className="hover:bg-muted hover:border-border h-3.5 w-3.5 rounded-full border border-transparent p-0"
            disabled={isNavigating}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(filter);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </span>
      </PopoverTrigger>

      <PopoverContent className="w-auto min-w-80 p-0" align="start">
        <FilterContent
          filter={filter}
          onValueChange={onValueChange}
          onRemove={onRemove}
        />
      </PopoverContent>
    </Popover>
  );
}
