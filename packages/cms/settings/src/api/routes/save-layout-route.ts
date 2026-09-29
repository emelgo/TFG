import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { createTableMetadataService } from '../services/table-metadata.service';

const ColumnSize = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

const SaveLayoutSchema = z.object({
  layout: z
    .object({
      id: z.string(),
      name: z.string(),
      display: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          rows: z.array(
            z.object({
              id: z.string(),
              columns: z.array(
                z.object({
                  id: z.string(),
                  fieldName: z.string(),
                  size: ColumnSize,
                  metadata: z.any().optional(),
                }),
              ),
            }),
          ),
          isCollapsed: z.boolean().optional(),
        }),
      ),
      edit: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          rows: z.array(
            z.object({
              id: z.string(),
              columns: z.array(
                z.object({
                  id: z.string(),
                  fieldName: z.string(),
                  size: ColumnSize,
                  metadata: z.any().optional(),
                }),
              ),
            }),
          ),
          isCollapsed: z.boolean().optional(),
        }),
      ),
    })
    .nullish(),
});

/**
 * Register the save layout router
 * @param router
 */
export function registerSaveLayoutRouter(router: Hono) {
  createSaveLayoutRouter(router);
}

/**
 * Create the save layout router
 * @param router
 */
function createSaveLayoutRouter(router: Hono) {
  return router.post(
    '/v1/resources/:schema/:table/layout',
    zValidator(
      'param',
      z.object({
        schema: z.string().min(1),
        table: z.string().min(1),
      }),
    ),
    zValidator('json', SaveLayoutSchema),
    async (c) => {
      const service = createTableMetadataService(c);
      const logger = await getLogger();
      const schema = c.req.param('schema');
      const table = c.req.param('table');
      const { layout } = c.req.valid('json');

      try {
        // Save the layout to the uiConfig field
        const result = await service.saveLayout({
          schema,
          table,
          layout,
        });

        logger.info(
          {
            schema,
            table,
            layoutId: layout?.id || 'reset',
          },
          layout ? 'Layout saved successfully' : 'Layout reset to default',
        );

        return c.json({ success: true, data: result });
      } catch (error) {
        logger.error(
          {
            error,
            schema,
            table,
          },
          'Error saving layout',
        );

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Save layout route type
 */
export type SaveLayoutRoute = ReturnType<typeof createSaveLayoutRouter>;
