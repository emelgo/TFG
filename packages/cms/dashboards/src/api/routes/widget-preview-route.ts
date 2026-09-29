import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { createWidgetsService } from '../services/widgets.service';

const WidgetPreviewDataSchema = z.object({
  schemaName: z.string(),
  tableName: z.string(),
  widgetType: z.string(),
  config: z.record(z.string(), z.unknown()),
  pagination: z
    .object({
      page: z.number().min(1),
      pageSize: z.number().min(1).max(1000),
    })
    .optional(),
  sorting: z
    .object({
      column: z.string(),
      direction: z.enum(['asc', 'desc']),
    })
    .optional(),
});

/**
 * Widget preview data route
 */
export function registerGetWidgetPreviewDataRoute(router: Hono) {
  return router.post(
    '/v1/widgets/preview-data',
    zValidator('json', WidgetPreviewDataSchema),
    async (c) => {
      const logger = await getLogger();
      const { pagination, sorting, ...widgetConfig } = c.req.valid('json');

      try {
        const service = createWidgetsService(c);
        const data = await service.getPreviewData(
          widgetConfig,
          pagination,
          sorting,
        );

        return c.json({
          success: true,
          data,
        });
      } catch (error) {
        logger.error(
          {
            error,
            widgetConfig,
          },
          'Failed to get widget preview data:',
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

export type GetWidgetPreviewDataRoute = ReturnType<
  typeof registerGetWidgetPreviewDataRoute
>;
