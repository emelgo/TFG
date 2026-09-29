import type { FilterCondition } from '@pymekit/cms-filters-core';
import type { ColumnMetadata, RelationConfig } from '@pymekit/cms-types';

import type { AdvancedFilterCondition } from '../../types';
import type {
  FilterItem,
  FilterOperator,
  FilterValue,
} from './filter-item.types';

/**
 * @param filters - The filters to adapt
 * @param columns - The columns to adapt
 * @param relations - The relations to adapt
 * @returns The adapted filters
 */
export function adaptFiltersForQuery(
  filters: AdvancedFilterCondition[],
  columns: ColumnMetadata[],
  relations: RelationConfig[] = [],
): FilterItem[] {
  const filterMap = new Map<string, FilterItem>();

  for (const filter of filters) {
    const column = columns.find((col) => col.name === filter.column);
    if (!column) continue;

    // Get or create FilterItem for this column
    let filterItem = filterMap.get(filter.column);

    if (!filterItem) {
      filterItem = {
        ...column,
        values: [],
        relations: relations.filter((r) => r.source_column === column.name),
      };

      filterMap.set(filter.column, filterItem);
    }

    // Add filter value - minimal conversion
    const filterValue: FilterValue = {
      operator: filter.operator,
      value: filter.value as string | boolean | number | Date | null,
      label: String(filter.value),
      // Preserve config metadata if present (for trend filters, etc.)
      config: filter.config,
    };

    filterItem.values.push(filterValue);
  }

  return Array.from(filterMap.values());
}

/**
 * Extract filter conditions from FilterItem array for query building
 * Simple, one-way conversion - no complex bidirectional transforms
 * Preserves any config metadata from original AdvancedFilterCondition
 */
export function extractFiltersForQuery(
  filterItems: FilterItem[],
): AdvancedFilterCondition[] {
  const conditions: AdvancedFilterCondition[] = [];

  for (const item of filterItems) {
    for (const value of item.values) {
      // Skip empty filters
      if (!value.value && !['isNull', 'notNull'].includes(value.operator)) {
        continue;
      }

      const condition: AdvancedFilterCondition = {
        column: item.name,
        operator: value.operator as FilterOperator,
        value: value.value,
      };

      // Preserve any metadata (like config.isTrendFilter) if present
      if (value.config) {
        condition.config = value.config;
      }

      conditions.push(condition);
    }
  }

  return conditions;
}

/**
 * Convert AdvancedFilterCondition array to FilterCondition array for backend
 * Strips dashboard-specific config but preserves core filter logic
 */
export function adaptFiltersForBackend(
  filters: AdvancedFilterCondition[],
): FilterCondition[] {
  return filters.map((filter) => ({
    column: filter.column,
    operator: filter.operator,
    value: filter.value,
    logicalOperator: filter.logicalOperator,
  }));
}
