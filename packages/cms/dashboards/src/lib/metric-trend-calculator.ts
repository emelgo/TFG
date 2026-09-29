/**
 * Metric Trend Calculator
 *
 * Handles calculating trend data for metric widgets by comparing current and previous periods.
 * Separated from the widgets service for better testability and reusability.
 */
import type { Context } from 'hono';

import { createTableQueryService } from '@pymekit/cms-data-explorer-core';
import type { FilterCondition } from '@pymekit/cms-filters-core';

import type { AdvancedFilterCondition } from '../types';
import { adaptFiltersForBackend } from './filters/dashboard-filter-adapter';
import { calculateTrendPercentage } from './trend-calculation';
import { parseTrendFilters } from './trend-filter-parser';
import { WidgetQueryBuilder } from './widget-query-builder';

export interface MetricTrendInput {
  widget: {
    id: string;
    schemaName: string;
    tableName: string;
    widgetType: string;
  };
  rawConfig: Record<string, unknown>;
  pagination?: { page: number; pageSize: number };
  context: Context;
}

export interface MetricTrendResult {
  data: Array<{
    /** `null` when the period produced no value at all (distinct from zero). */
    value: string | null;
    previousValue: string | null;
    /** `null` when the two periods are not comparable. */
    trendPercentage: number | null;
    trend: 'up' | 'down' | 'stable' | null;
    previousPeriodStart: string;
    previousPeriodEnd: string;
  }>;
  metadata: {
    totalCount: number;
    pageCount: number;
    lastUpdated: string;
    trendFilters: Array<{
      column: string;
      operator: string;
      value: unknown;
      config?: Record<string, unknown>;
    }>;
    trendDateColumns: string[];
    currentPeriod: {
      start: string;
      end: string;
    };
    previousPeriod: {
      start: string;
      end: string;
    };
  };
}

/**
 * Calculate metric trend data by comparing current and previous periods
 */
export async function calculateMetricTrend(
  input: MetricTrendInput,
): Promise<MetricTrendResult> {
  const { widget, rawConfig, pagination, context } = input;

  const tableQuery = createTableQueryService(context);

  // Get current filters, separating trend filters from regular filters
  const rawFilters = (rawConfig['filters'] as AdvancedFilterCondition[]) || [];

  const trendFilters = rawFilters.filter((f) => f.config?.['isTrendFilter']);
  const regularFilters = rawFilters.filter((f) => !f.config?.['isTrendFilter']);

  // Parse trend filters to get current and previous periods
  const { currentPeriod, previousPeriod, trendColumn } =
    parseTrendFilters(trendFilters);

  const { start: currentStart, end: currentEnd } = currentPeriod;
  const { start: previousStart, end: previousEnd } = previousPeriod;

  // Convert config for query builder (without trend filters for base query)
  const configWithoutTrendFilters = {
    ...rawConfig,
    filters: regularFilters,
  };

  const config = adaptConfigForQueryBuilder(configWithoutTrendFilters);

  // Build base query parameters
  const baseQueryParams = WidgetQueryBuilder.buildQueryParams(
    widget,
    config,
    pagination,
  );

  // Get regular filters (excluding trend filters)
  const existingFilters = adaptFiltersForBackend(regularFilters);

  // Create period filters
  const currentPeriodFilter: FilterCondition = {
    column: trendColumn,
    operator: 'between',
    value: `${currentStart.toISOString()},${currentEnd.toISOString()}`,
  };

  const previousPeriodFilter: FilterCondition = {
    column: trendColumn,
    operator: 'between',
    value: `${previousStart.toISOString()},${previousEnd.toISOString()}`,
  };

  // Execute queries for both periods
  const [currentResult, previousResult] = await Promise.all([
    tableQuery.queryTableData({
      ...baseQueryParams,
      filters: [...existingFilters, currentPeriodFilter],
    }),
    tableQuery.queryTableData({
      ...baseQueryParams,
      filters: [...existingFilters, previousPeriodFilter],
    }),
  ]);

  // Extract metric values. `null` means the period has no value at all (an
  // ungrouped aggregate over zero rows), which is distinct from a real zero.
  const { extractMetricValue } = await import('./trend-calculator');
  const currentValue = extractMetricValue(currentResult.data || []);
  const previousValue = extractMetricValue(previousResult.data || []);

  // A trend is only meaningful when both periods produced a value. Emitting
  // nulls lets the widget render "no data" instead of a fabricated comparison.
  const hasComparablePeriods = currentValue !== null && previousValue !== null;

  const { trendPercentage, trendDirection } = hasComparablePeriods
    ? calculateTrendPercentage(currentValue, previousValue)
    : { trendPercentage: null, trendDirection: null };

  // Return structured result
  return {
    data: [
      {
        value: currentValue === null ? null : currentValue.toString(),
        previousValue: previousValue === null ? null : previousValue.toString(),
        trendPercentage:
          trendPercentage === null
            ? null
            : Math.round(trendPercentage * 100) / 100, // Round to 2 decimal places
        trend: trendDirection,
        previousPeriodStart: previousStart.toISOString(),
        previousPeriodEnd: previousEnd.toISOString(),
      },
    ],
    metadata: {
      totalCount: 1,
      pageCount: 1,
      lastUpdated: new Date().toISOString(),
      // Include trend filter metadata for frontend processing (only the first one used)
      trendFilters: trendFilters.slice(0, 1).map((f) => ({
        column: f.column,
        operator: f.operator,
        value: f.value,
        config: f.config,
      })),
      // Include detected date columns for trend analysis
      trendDateColumns: [trendColumn],
      // Include period information for debugging
      currentPeriod: {
        start: currentStart.toISOString(),
        end: currentEnd.toISOString(),
      },
      previousPeriod: {
        start: previousStart.toISOString(),
        end: previousEnd.toISOString(),
      },
    },
  };
}

/**
 * Convert dashboard config to query builder format
 * Handles AdvancedFilterCondition to FilterCondition conversion
 */
function adaptConfigForQueryBuilder(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const adaptedConfig = { ...config };

  // Convert AdvancedFilterCondition[] to FilterCondition[] if present
  if (config['filters'] && Array.isArray(config['filters'])) {
    adaptedConfig['filters'] = adaptFiltersForBackend(
      config['filters'] as AdvancedFilterCondition[],
    );
  }

  return adaptedConfig;
}
