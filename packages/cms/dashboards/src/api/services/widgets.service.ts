import { and, eq } from 'drizzle-orm';
import { Context } from 'hono';
import { z } from 'zod';

import {
  createTableMetadataService,
  createTableQueryService,
} from '@pymekit/cms-data-explorer-core';
import type { FilterCondition } from '@pymekit/cms-filters-core';
import {
  type WidgetDefinition,
  WidgetDefinitionSchema,
  WidgetPositionSchema,
} from '@pymekit/cms-shared/dashboards';
import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import { dashboardWidgetsInCms } from '@pymekit/cms-supabase/schema';

import { adaptFiltersForBackend } from '../../lib/filters/dashboard-filter-adapter';
import { calculateMetricTrend } from '../../lib/metric-trend-calculator';
import { WidgetConfigValidator } from '../../lib/widget-config-validator';
import {
  applySizeConstraints,
  convertWidgetsToLayout,
  getWidgetSizeConstraints,
} from '../../lib/widget-layout-processor';
import { findOptimalPosition } from '../../lib/widget-positioning';
import {
  type WidgetConfig,
  WidgetQueryBuilder,
} from '../../lib/widget-query-builder';
import type { AdvancedFilterCondition } from '../../types';
import type { WidgetData } from '../../types';
import { DashboardError } from '../dashboard-errors';
import {
  assertCanEditDashboard,
  assertValidWidgetSource,
} from './dashboard-access';
import { createWidgetViewService } from './widget-view.service';

/**
 * Petición de crear un *widget*: la definición estricta compartida con la
 * interfaz (`WidgetDefinitionSchema`, sin SQL libre) más el panel y la
 * posición. [TFG] RF-11: sustituye a `config: z.record(z.unknown())`.
 */
export const CreateWidgetSchema = z.intersection(
  WidgetDefinitionSchema,
  z.object({
    dashboardId: z.uuid(),
    position: WidgetPositionSchema.optional(),
  }),
);

export type CreateWidgetType = z.infer<typeof CreateWidgetSchema>;

/**
 * Editar un *widget* reemplaza su definición completa (tipo, título, tabla y
 * configuración). La posición se cambia aparte (`PUT /v1/widgets/positions`).
 */
export const UpdateWidgetSchema = WidgetDefinitionSchema;

export type UpdateWidgetType = WidgetDefinition;

/**
 * Create a widgets service with appropriate validation context
 */
export function createWidgetsService(context: Context) {
  return new WidgetsService(context);
}

/**
 * Service class for managing dashboard widgets
 */
class WidgetsService {
  constructor(private readonly context: Context) {}

  /**
   * Get all widgets for a dashboard
   */
  async getWidgetsByDashboard(dashboardId: string) {
    const db = this.context.get('drizzle');

    return await db.runTransaction(async (tx) => {
      return tx
        .select()
        .from(dashboardWidgetsInCms)
        .where(eq(dashboardWidgetsInCms.dashboardId, dashboardId))
        .orderBy(dashboardWidgetsInCms.createdAt);
    });
  }

  /**
   * Get a specific widget by ID
   */
  async getWidget(id: string) {
    const db = this.context.get('drizzle');

    const result = await db.runTransaction(async (tx) => {
      return tx
        .select()
        .from(dashboardWidgetsInCms)
        .where(eq(dashboardWidgetsInCms.id, id))
        .limit(1);
    });

    return result[0];
  }

  /**
   * Create a new widget with automatic position adjustment
   */
  async createWidget(data: CreateWidgetType) {
    const db = this.context.get('drizzle');

    // [TFG] RF-11: editar el panel (404/403 con código) y origen válido:
    // esquema no protegido, tabla gestionada y legible por quien edita y
    // columnas existentes. La política `insert_widgets` vuelve a exigir
    // `has_data_permission` en la base de datos.
    await assertCanEditDashboard(this.context, data.dashboardId);
    await assertValidWidgetSource(this.context, data);

    // Get existing widgets to check for overlaps
    const existingWidgets = await this.getWidgetsByDashboard(data.dashboardId);

    // Convert to layout items for position checking
    const existingLayout = convertWidgetsToLayout(
      existingWidgets.map((widget) => ({
        id: widget.id,
        position: widget.position as
          | string
          | { x: number; y: number; w: number; h: number },
      })),
    );

    // Apply widget type size constraints and handle optional position
    const constraints = getWidgetSizeConstraints(data.widgetType);
    const requestedPosition = data.position || { x: 0, y: 0, w: 4, h: 3 };
    const constrainedSize = applySizeConstraints(
      requestedPosition,
      constraints,
    );

    // Find optimal position (may adjust if there's overlap)
    const { position: finalPosition, wasAdjusted } = findOptimalPosition(
      constrainedSize,
      existingLayout,
      { x: requestedPosition.x, y: requestedPosition.y },
    );

    const result = await db.runTransaction(async (tx) => {
      return tx
        .insert(dashboardWidgetsInCms)
        .values({
          dashboardId: data.dashboardId,
          widgetType: data.widgetType,
          title: data.title,
          schemaName: data.schemaName,
          tableName: data.tableName,
          config: data.config, // Let Drizzle handle jsonb serialization
          position: finalPosition,
        })
        .returning();
    });

    if (!result[0]) {
      throw new Error('Failed to create widget');
    }

    // Return the widget with metadata about position adjustment
    return {
      ...result[0],
      _positionAdjusted: wasAdjusted,
      _originalPosition: data.position,
      _finalPosition: finalPosition,
    };
  }

  /**
   * Reemplaza la definición de un *widget* (no su posición).
   *
   * Antes la política `update_widgets` no tenía `WITH CHECK`, así que se
   * podía apuntar un *widget* a una tabla que quien edita no puede leer. Hoy
   * se comprueba aquí (con código de error) y en la base de datos (F2.8).
   */
  async updateWidget(id: string, data: UpdateWidgetType) {
    const db = this.context.get('drizzle');
    const widget = await this.getWidget(id);

    if (!widget) {
      throw new DashboardError(CMS_API_ERROR_CODES.DASHBOARD_WIDGET_NOT_FOUND);
    }

    await assertCanEditDashboard(this.context, widget.dashboardId);
    await assertValidWidgetSource(this.context, data);

    const result = await db.runTransaction(async (tx) => {
      return tx
        .update(dashboardWidgetsInCms)
        .set({
          title: data.title,
          widgetType: data.widgetType,
          schemaName: data.schemaName,
          tableName: data.tableName,
          config: data.config,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(dashboardWidgetsInCms.id, id))
        .returning();
    });

    if (!result[0]) {
      throw new DashboardError(CMS_API_ERROR_CODES.DASHBOARD_WIDGET_NOT_FOUND);
    }

    return result[0];
  }

  /**
   * Delete a widget
   */
  async deleteWidget(id: string): Promise<void> {
    const db = this.context.get('drizzle');
    const widget = await this.getWidget(id);

    if (!widget) {
      throw new DashboardError(CMS_API_ERROR_CODES.DASHBOARD_WIDGET_NOT_FOUND);
    }

    await assertCanEditDashboard(this.context, widget.dashboardId);

    await db.runTransaction(async (tx) => {
      await tx
        .delete(dashboardWidgetsInCms)
        .where(eq(dashboardWidgetsInCms.id, id));
    });
  }

  /**
   * Get preview data for a widget configuration (without requiring a saved widget)
   */
  async getPreviewData(
    widgetConfig: {
      schemaName: string;
      tableName: string;
      widgetType: string;
      config: Record<string, unknown>;
    },
    pagination?: { page: number; pageSize: number },
    sorting?: { column: string; direction: 'asc' | 'desc' },
  ): Promise<WidgetData> {
    // Basic validation - RLS policies will handle permissions
    if (!widgetConfig.schemaName || !widgetConfig.tableName) {
      throw new Error('Schema and table name are required');
    }

    // For table widgets, use the same enhanced logic as getTableWidgetDataWithFilters
    if (widgetConfig.widgetType === 'table') {
      // Extract widget configuration for data-explorer-core
      const properties =
        widgetConfig.config['columns'] &&
        Array.isArray(widgetConfig.config['columns'])
          ? { columns: widgetConfig.config['columns'] }
          : undefined;

      // Extract widget filters
      const widgetFilters =
        (widgetConfig.config?.['filters'] as FilterCondition[]) || [];

      // Determine sorting: provided sorting takes precedence over configured sorting
      const effectiveSortColumn =
        sorting?.column ||
        (widgetConfig.config?.['sortBy'] as string) ||
        undefined;
      const effectiveSortDirection =
        sorting?.direction ||
        (widgetConfig.config?.['sortDirection'] as 'asc' | 'desc') ||
        undefined;

      // Use data-explorer-core with widget filters applied
      const tableQuery = createTableQueryService(this.context);
      const result = await tableQuery.queryTableData({
        schemaName: widgetConfig.schemaName,
        tableName: widgetConfig.tableName,
        page: pagination?.page || 1,
        pageSize: pagination?.pageSize || 25,
        properties,
        sortColumn: effectiveSortColumn,
        sortDirection: effectiveSortDirection,
        filters: widgetFilters, // Pass widget filters directly
      });

      // Transform to WidgetData format
      return {
        data: result.data || [],
        metadata: {
          totalCount: result.totalCount || 0,
          pageCount: result.pageCount || 0,
          lastUpdated: new Date().toISOString(),
        },
      } as WidgetData;
    }

    // For non-table widgets, use the original logic
    // Parse and validate widget configuration
    const rawConfig = WidgetQueryBuilder.parseWidgetConfig(widgetConfig.config);
    const config = this.adaptConfigForQueryBuilder(rawConfig);

    // Validate configuration before building query
    await this.validateWidgetConfiguration(widgetConfig, config);

    // Use the same query building logic as getWidgetData for consistency
    const queryParams = WidgetQueryBuilder.buildQueryParams(
      widgetConfig,
      config,
      pagination,
    );

    // Execute query
    const tableQuery = createTableQueryService(this.context);
    const result = await tableQuery.queryTableData(queryParams);

    // Transform to WidgetData format
    return {
      data: result.data || [],
      metadata: {
        totalCount: result.totalCount || 0,
        pageCount: result.pageCount || 0,
        lastUpdated: new Date().toISOString(),
      },
    } as WidgetData;
  }

  /**
   * Get widget data by executing the widget's query
   */
  async getWidgetData(
    widgetId: string,
    pagination?: { page: number; pageSize: number },
  ): Promise<WidgetData> {
    const widget = await this.getWidget(widgetId);

    if (!widget) {
      throw new Error('Widget not found');
    }

    // Algorithmic: Parse configuration and build query parameters
    const rawConfig = WidgetQueryBuilder.parseWidgetConfig(widget.config);
    const config = this.adaptConfigForQueryBuilder(rawConfig);

    // Check if this is a metric widget with trend filters enabled
    const hasConfigTrendFilters = (
      rawConfig['filters'] as AdvancedFilterCondition[]
    )?.some((f) => f.config?.['isTrendFilter']);
    if (widget.widgetType === 'metric' && hasConfigTrendFilters) {
      return calculateMetricTrend({
        widget,
        rawConfig,
        pagination,
        context: this.context,
      });
    }

    // Validate configuration before building query
    await this.validateWidgetConfiguration(widget, config);

    const queryParams = WidgetQueryBuilder.buildQueryParams(
      widget,
      config,
      pagination,
    );

    // Query execution: Use data-explorer-core to execute the query
    const tableQuery = createTableQueryService(this.context);
    const result = await tableQuery.queryTableData(queryParams);

    // Transform to WidgetData format
    return {
      data: result.data || [],
      metadata: {
        totalCount: result.totalCount || 0,
        pageCount: result.pageCount || 0,
        lastUpdated: new Date().toISOString(),
      },
    } as WidgetData;
  }

  /**
   * Convert dashboard config to query builder format
   * Handles AdvancedFilterCondition to FilterCondition conversion
   */
  private adaptConfigForQueryBuilder(
    config: Record<string, unknown>,
  ): WidgetConfig {
    const adaptedConfig = { ...config };

    // Convert AdvancedFilterCondition[] to FilterCondition[] if present
    if (config['filters'] && Array.isArray(config['filters'])) {
      adaptedConfig['filters'] = adaptFiltersForBackend(
        config['filters'] as AdvancedFilterCondition[],
      );
    }

    return adaptedConfig as WidgetConfig;
  }

  /**
   * Validate widget configuration to prevent invalid queries
   */
  private async validateWidgetConfiguration(
    widget: {
      schemaName: string;
      tableName: string;
      widgetType: string;
    },
    config: WidgetConfig,
  ): Promise<void> {
    try {
      // Fetch table metadata to check column types
      const metadataService = createTableMetadataService();

      const metadata = await metadataService.getTableMetadata({
        schemaName: widget.schemaName,
        tableName: widget.tableName,
      });

      // Use the extracted validator for testable logic
      const validation = WidgetConfigValidator.validateConfiguration(
        config,
        widget.widgetType,
        metadata.columns,
      );

      // Apply the validated configuration
      Object.assign(config, validation.config);

      // Log warnings
      validation.warnings.forEach((warning) => {
        console.warn(`Widget validation warning: ${warning}`);
      });

      // Throw errors
      if (validation.errors.length > 0) {
        throw new Error(
          `Widget validation failed: ${validation.errors.join(', ')}`,
        );
      }
    } catch (error) {
      // If metadata fetch fails, disable time aggregation to be safe
      if (config.timeAggregation) {
        config.timeAggregation = undefined;
        console.warn(
          'Failed to validate widget configuration, disabling time aggregation:',
          error,
        );
      }
    }
  }

  /**
   * Get table widget data with both configured filters and interactive search/pagination
   * This method enhances data-explorer-core with widget filters
   */
  async getTableWidgetDataWithFilters({
    widgetId,
    page,
    pageSize,
    search,
    sortColumn,
    sortDirection,
  }: {
    widgetId: string;
    page: number;
    pageSize: number;
    search?: string;
    sortColumn?: string;
    sortDirection?: 'asc' | 'desc';
  }): Promise<WidgetData> {
    const widget = await this.getWidget(widgetId);

    if (!widget) {
      throw new Error('Widget not found');
    }

    if (widget.widgetType !== 'table') {
      throw new Error('This method only supports table widgets');
    }

    // Parse widget config to get configured filters
    const config: Record<string, unknown> =
      typeof widget.config === 'string'
        ? JSON.parse(widget.config)
        : (widget.config as Record<string, unknown>);

    // Extract widget configuration for data-explorer-core
    const properties =
      config['columns'] && Array.isArray(config['columns'])
        ? { columns: config['columns'] }
        : undefined;

    // Extract widget filters
    const widgetFilters = (config?.['filters'] as FilterCondition[]) || [];

    // Determine sorting: runtime sorting takes precedence over configured sorting
    const effectiveSortColumn =
      sortColumn || (config?.['sortBy'] as string) || undefined;
    const effectiveSortDirection =
      sortDirection ||
      (config?.['sortDirection'] as 'asc' | 'desc') ||
      undefined;

    // Use data-explorer-core with widget filters applied
    const tableQuery = createTableQueryService(this.context);

    const result = await tableQuery.queryTableData({
      schemaName: widget.schemaName,
      tableName: widget.tableName,
      page,
      pageSize,
      properties,
      search,
      sortColumn: effectiveSortColumn,
      sortDirection: effectiveSortDirection,
      filters: widgetFilters, // Pass widget filters directly
    });

    // Transform to WidgetData format
    return {
      data: result.data || [],
      metadata: {
        totalCount: result.totalCount || 0,
        pageCount: result.pageCount || 0,
        lastUpdated: new Date().toISOString(),
      },
    } as WidgetData;
  }

  /**
   * Guarda las posiciones de varios *widgets* de UN panel (mover y
   * redimensionar en la rejilla). Cada UPDATE se limita a ese panel, así
   * que no se pueden mover *widgets* de otro panel en la misma petición.
   */
  async updateWidgetPositions(
    dashboardId: string,
    updates: Array<{
      id: string;
      position: { x: number; y: number; w: number; h: number };
    }>,
  ) {
    const db = this.context.get('drizzle');
    const updatedAt = new Date().toISOString();

    await assertCanEditDashboard(this.context, dashboardId);

    await db.runTransaction(async (tx) => {
      for (const update of updates) {
        await tx
          .update(dashboardWidgetsInCms)
          .set({
            position: update.position,
            // The widget_changes_update_dashboard trigger is AFTER, so nothing
            // maintains this column at the DB level.
            updatedAt,
          })
          .where(
            and(
              eq(dashboardWidgetsInCms.id, update.id),
              eq(dashboardWidgetsInCms.dashboardId, dashboardId),
            ),
          );
      }
    });
  }

  /**
   * Get table widget data with formatted relations
   * This method enhances the table widget data with properly formatted relation display names
   */
  async getTableWidgetDataWithRelations({
    widgetId,
    page,
    pageSize,
    search,
    sortColumn,
    sortDirection,
  }: {
    widgetId: string;
    page: number;
    pageSize: number;
    search?: string;
    sortColumn?: string;
    sortDirection?: 'asc' | 'desc';
  }): Promise<{
    data: WidgetData;
    relations: Array<{
      column: string;
      original: unknown;
      formatted: string | null | undefined;
      link: string | null | undefined;
    }>;
  }> {
    const widget = await this.getWidget(widgetId);

    if (!widget) {
      throw new Error('Widget not found');
    }

    if (widget.widgetType !== 'table') {
      throw new Error('This method only supports table widgets');
    }

    // Parse widget config to get configured filters
    const config: Record<string, unknown> =
      typeof widget.config === 'string'
        ? JSON.parse(widget.config)
        : (widget.config as Record<string, unknown>);

    // Extract widget configuration for data-explorer-core
    const properties =
      config['columns'] && Array.isArray(config['columns'])
        ? { columns: config['columns'] }
        : undefined;

    // Extract widget filters and adapt them
    const widgetFilters = config?.['filters']
      ? adaptFiltersForBackend(config['filters'] as AdvancedFilterCondition[])
      : [];

    // Determine sorting: runtime sorting takes precedence over configured sorting
    const effectiveSortColumn =
      sortColumn || (config?.['sortBy'] as string) || undefined;

    const effectiveSortDirection =
      sortDirection ||
      (config?.['sortDirection'] as 'asc' | 'desc') ||
      undefined;

    // Use widget view service to get data with relations
    const widgetViewService = createWidgetViewService(this.context);

    const result = await widgetViewService.queryWidgetView({
      schemaName: widget.schemaName,
      tableName: widget.tableName,
      page,
      pageSize,
      properties,
      search,
      sortColumn: effectiveSortColumn,
      sortDirection: effectiveSortDirection,
      filters: widgetFilters,
    });

    // Transform to WidgetData format
    return {
      data: {
        data: result.data || [],
        metadata: {
          totalCount: result.totalCount || 0,
          pageCount: result.pageCount || 0,
          lastUpdated: new Date().toISOString(),
        },
      } as WidgetData,
      relations: result.relations,
    };
  }
}
