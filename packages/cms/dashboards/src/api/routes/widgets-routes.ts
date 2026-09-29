import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { applyWidgetTemplate } from '../../lib/widget-template-processor';
import { ApplyWidgetTemplateSchema, WidgetPositionSchema } from '../schemas';
import {
  CreateWidgetSchema,
  UpdateWidgetSchema,
  createWidgetsService,
} from '../services/widgets.service';
import {
  type GetWidgetPreviewDataRoute,
  registerGetWidgetPreviewDataRoute,
} from './widget-preview-route';

/**
 * Widgets routes registration
 */
export function registerWidgetsRoutes(router: Hono) {
  registerGetWidgetsByDashboardRoute(router);
  registerCreateWidgetRoute(router);
  // Register specific routes BEFORE generic parameterized routes
  registerApplyWidgetTemplateRoute(router); // Template application route
  registerUpdateWidgetPositionsRoute(router);
  registerGetWidgetPreviewDataRoute(router);
  registerGetWidgetTableDataRoute(router); // New table-specific route
  // Generic routes with :id parameter come after specific routes
  registerGetWidgetRoute(router);
  registerGetWidgetDataRoute(router);
  registerUpdateWidgetRoute(router);
  registerDeleteWidgetRoute(router);
}

/**
 * Route type exports for client usage
 */
export type GetWidgetsByDashboardRoute = ReturnType<
  typeof registerGetWidgetsByDashboardRoute
>;

export type GetWidgetRoute = ReturnType<typeof registerGetWidgetRoute>;
export type GetWidgetDataRoute = ReturnType<typeof registerGetWidgetDataRoute>;

export type GetWidgetTableDataRoute = ReturnType<
  typeof registerGetWidgetTableDataRoute
>;

export type CreateWidgetRoute = ReturnType<typeof registerCreateWidgetRoute>;
export type UpdateWidgetRoute = ReturnType<typeof registerUpdateWidgetRoute>;
export type DeleteWidgetRoute = ReturnType<typeof registerDeleteWidgetRoute>;

export type UpdateWidgetPositionsRoute = ReturnType<
  typeof registerUpdateWidgetPositionsRoute
>;

export type ApplyWidgetTemplateRoute = ReturnType<
  typeof registerApplyWidgetTemplateRoute
>;

export type { GetWidgetPreviewDataRoute };

const WidgetParamsSchema = z.object({
  id: z.string().uuid(),
});

const DashboardParamsSchema = z.object({
  dashboardId: z.string().uuid(),
});

/**
 * @name registerGetWidgetsByDashboardRoute
 */
function registerGetWidgetsByDashboardRoute(router: Hono) {
  return router.get(
    '/v1/dashboards/:dashboardId/widgets',
    zValidator('param', DashboardParamsSchema),
    async (c) => {
      const logger = await getLogger();

      try {
        const { dashboardId } = c.req.valid('param');
        const service = createWidgetsService(c);
        const widgets = await service.getWidgetsByDashboard(dashboardId);

        return c.json({
          success: true,
          data: widgets,
        });
      } catch (error) {
        logger.error(
          {
            error,
          },
          'Failed to get widgets:',
        );
        return c.json(
          {
            success: false,
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/**
 * @name registerGetWidgetRoute
 */
function registerGetWidgetRoute(router: Hono) {
  return router.get(
    '/v1/widgets/:id',
    zValidator('param', WidgetParamsSchema),
    async (c) => {
      const logger = await getLogger();
      const { id } = c.req.valid('param');

      try {
        const service = createWidgetsService(c);
        const widget = await service.getWidget(id);

        if (!widget) {
          return c.json(
            {
              success: false,
              error: 'Widget not found',
            },
            404,
          );
        }

        return c.json({
          success: true,
          data: widget,
        });
      } catch (error) {
        logger.error(
          {
            error,
          },
          'Failed to get widget:',
        );
        return c.json(
          {
            success: false,
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/** Mirrors the cap the data-explorer applies to the same tables. */
const MAX_PAGE_SIZE = 500;

const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  // Add search and sort parameters for table widgets
  search: z.string().optional(),
  sort_column: z.string().optional(),
  sort_direction: z.enum(['asc', 'desc']).optional(),
});

/**
 * @name registerGetWidgetDataRoute
 */
function registerGetWidgetDataRoute(router: Hono) {
  return router.get(
    '/v1/widgets/:id/data',
    zValidator('param', WidgetParamsSchema),
    zValidator('query', PaginationQuerySchema),
    async (c) => {
      const logger = await getLogger();
      const { id } = c.req.valid('param');
      const { page, pageSize, search, sort_column, sort_direction } =
        c.req.valid('query');

      try {
        const service = createWidgetsService(c);

        // Check if this is a table widget and search/sort parameters are provided
        const widget = await service.getWidget(id);
        if (!widget) {
          return c.json(
            {
              success: false,
              error: 'Widget not found',
            },
            404,
          );
        }

        // For table widgets, use the enhanced method with relations
        if (widget.widgetType === 'table') {
          const result = await service.getTableWidgetDataWithRelations({
            widgetId: id,
            page: page || 1,
            pageSize: pageSize || 25,
            search,
            sortColumn: sort_column,
            sortDirection: sort_direction,
          });

          return c.json({
            success: true,
            data: result.data,
            relations: result.relations,
          });
        }

        // For chart/metric widgets, use the standard method
        const pagination = page && pageSize ? { page, pageSize } : undefined;
        const data = await service.getWidgetData(id, pagination);

        return c.json({
          success: true,
          data,
        });
      } catch (error) {
        logger.error(
          {
            error,
          },
          'Failed to get widget data:',
        );

        if (error instanceof Error && error.message === 'Widget not found') {
          return c.json(
            {
              success: false,
              error: 'Widget not found',
            },
            404,
          );
        }

        return c.json(
          {
            success: false,
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/**
 * @name registerCreateWidgetRoute
 */
function registerCreateWidgetRoute(router: Hono) {
  return router.post(
    '/v1/widgets',
    zValidator('json', CreateWidgetSchema),
    async (c) => {
      const logger = await getLogger();
      const data = c.req.valid('json');

      try {
        const service = createWidgetsService(c);
        const widgetResult = await service.createWidget(data);

        // Extract position adjustment metadata
        const {
          _positionAdjusted,
          _originalPosition,
          _finalPosition,
          ...widget
        } = widgetResult;

        return c.json(
          {
            success: true,
            data: widget,
            positionAdjusted: _positionAdjusted,
            originalPosition: _originalPosition,
            finalPosition: _finalPosition,
          },
          201,
        );
      } catch (error) {
        logger.error(
          {
            error,
          },
          'Failed to create widget:',
        );

        if (error instanceof Error && error.message.includes('overlaps')) {
          return c.json(
            {
              success: false,
              error: 'Widget position overlaps with existing widget',
            },
            400,
          );
        }

        if (
          error instanceof Error &&
          error.message.includes('is not registered')
        ) {
          return c.json(
            {
              success: false,
              error: error.message,
            },
            400,
          );
        }

        return c.json(
          {
            success: false,
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/**
 * @name registerUpdateWidgetRoute
 */
function registerUpdateWidgetRoute(router: Hono) {
  return router.put(
    '/v1/widgets/:id',
    zValidator('param', WidgetParamsSchema),
    zValidator('json', UpdateWidgetSchema),
    async (c) => {
      const logger = await getLogger();
      const { id } = c.req.valid('param');
      const data = c.req.valid('json');

      try {
        const service = createWidgetsService(c);

        const widget = await service.updateWidget(id, data);

        return c.json({
          success: true,
          data: widget,
        });
      } catch (error) {
        logger.error(
          {
            error,
          },
          'Failed to update widget:',
        );

        if (error instanceof Error) {
          if (error.message === 'Widget not found') {
            return c.json(
              {
                success: false,
                error: 'Widget not found',
              },
              404,
            );
          }

          if (error.message.includes('overlaps')) {
            return c.json(
              {
                success: false,
                error: 'Widget position overlaps with existing widget',
              },
              400,
            );
          }
        }

        return c.json(
          {
            success: false,
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/**
 * @name registerDeleteWidgetRoute
 */
function registerDeleteWidgetRoute(router: Hono) {
  return router.delete(
    '/v1/widgets/:id',
    zValidator('param', WidgetParamsSchema),
    async (c) => {
      const logger = await getLogger();
      const { id } = c.req.valid('param');

      try {
        const service = createWidgetsService(c);

        // delete widget from the database
        await service.deleteWidget(id);

        return c.json({
          success: true,
          message: 'Widget deleted successfully',
        });
      } catch (error) {
        logger.error(
          {
            error,
          },
          'Failed to delete widget:',
        );

        if (error instanceof Error && error.message === 'Widget not found') {
          return c.json(
            {
              success: false,
              error: 'Widget not found',
            },
            404,
          );
        }

        return c.json(
          {
            success: false,
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/** Each entry is a separate UPDATE in one transaction. */
const MAX_POSITION_UPDATES = 200;

const UpdateWidgetPositionsSchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().uuid(),
        position: WidgetPositionSchema,
      }),
    )
    .max(MAX_POSITION_UPDATES)
    .refine(
      (updates) =>
        new Set(updates.map((update) => update.id)).size === updates.length,
      { message: 'Duplicate widget ids in position update' },
    ),
});

/**
 * @name registerUpdateWidgetPositionsRoute
 */
function registerUpdateWidgetPositionsRoute(router: Hono) {
  return router.put(
    '/v1/widgets/positions',
    zValidator('json', UpdateWidgetPositionsSchema),
    async (c) => {
      const logger = await getLogger();
      const { updates } = c.req.valid('json');

      logger.info(
        {
          updates,
        },
        'Updating widget positions:',
      );

      try {
        const service = createWidgetsService(c);

        // update widget positions
        await service.updateWidgetPositions(updates);

        return c.json({
          success: true,
          message: 'Widget positions updated successfully',
          data: updates,
        });
      } catch (error) {
        logger.error(
          {
            error,
          },
          'Failed to update widget positions:',
        );

        return c.json(
          {
            success: false,
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}
/**
 * @name registerGetWidgetTableDataRoute
 * @description Register a route for getting table widget data using data-explorer
 */
function registerGetWidgetTableDataRoute(router: Hono) {
  return router.get(
    '/v1/widgets/:id/table-data',
    zValidator('param', WidgetParamsSchema),
    zValidator(
      'query',
      z.object({
        page: z.coerce.number().int().min(1).optional().default(1),
        pageSize: z.coerce
          .number()
          .int()
          .min(1)
          .max(MAX_PAGE_SIZE)
          .optional()
          .default(25),
        search: z.string().optional(),
        sort_column: z.string().optional(),
        sort_direction: z.enum(['asc', 'desc']).optional(),
      }),
    ),
    async (c) => {
      const logger = await getLogger();
      const { id } = c.req.valid('param');

      const { page, pageSize, search, sort_column, sort_direction } =
        c.req.valid('query');

      try {
        const service = createWidgetsService(c);

        // Get widget details to extract schema and table info
        const widget = await service.getWidget(id);

        if (!widget) {
          return c.json(
            {
              success: false,
              error: 'Widget not found',
            },
            404,
          );
        }

        // Only handle table widgets
        if (widget.widgetType !== 'table') {
          return c.json(
            {
              success: false,
              error: 'This endpoint only supports table widgets',
            },
            400,
          );
        }

        // Use the enhanced table widget method that includes configured filters
        const transformedData = await service.getTableWidgetDataWithFilters({
          widgetId: id,
          page,
          pageSize,
          search,
          sortColumn: sort_column,
          sortDirection: sort_direction,
        });

        return c.json({
          success: true,
          data: transformedData,
        });
      } catch (error) {
        logger.error(
          {
            widgetId: id,
            error,
          },
          'Failed to get table widget data',
        );

        return c.json(
          {
            success: false,
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/**
 * @name registerApplyWidgetTemplateRoute
 * @description Register a route for applying a widget template to a dashboard
 */
function registerApplyWidgetTemplateRoute(router: Hono) {
  return router.post(
    '/v1/dashboards/:dashboardId/widgets/from-template',
    zValidator('param', DashboardParamsSchema),
    zValidator('json', ApplyWidgetTemplateSchema),
    async (c) => {
      const logger = await getLogger();
      const { dashboardId } = c.req.valid('param');
      const { templateId } = c.req.valid('json');

      logger.info(
        {
          dashboardId,
          templateId,
        },
        'Applying widget template to dashboard',
      );

      try {
        // Apply the template
        const result = await applyWidgetTemplate(c, {
          dashboardId,
          templateId,
        });

        logger.info(
          {
            widgetCount: result.widgetCount,
            adjustedWidgets: result.adjustedWidgets,
          },
          'Widget template applied successfully',
        );

        return c.json(
          {
            success: true,
            data: {
              widgetIds: result.widgetIds,
              widgetCount: result.widgetCount,
              adjustedWidgets: result.adjustedWidgets,
            },
            message: `Successfully created ${result.widgetCount} widgets from template${
              result.adjustedWidgets > 0
                ? ` (${result.adjustedWidgets} positions adjusted)`
                : ''
            }`,
          },
          201,
        );
      } catch (error) {
        logger.error(
          {
            dashboardId,
            templateId,
            error,
          },
          'Failed to apply widget template',
        );

        if (error instanceof Error) {
          if (error.message.includes('Template not found')) {
            return c.json(
              {
                success: false,
                error: 'Template not found',
              },
              404,
            );
          }

          if (error.message.includes('no widgets')) {
            return c.json(
              {
                success: false,
                error: 'Template has no widgets to create',
              },
              400,
            );
          }
        }

        return c.json(
          {
            success: false,
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}
