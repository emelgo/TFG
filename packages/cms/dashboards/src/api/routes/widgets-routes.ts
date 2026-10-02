/**
 * Rutas de los *widgets* de los paneles (`/v1/widgets/**`).
 *
 *  - `POST /v1/widgets`: crea un *widget* (definición estricta compartida).
 *  - `PUT /v1/widgets/positions`: mueve/redimensiona *widgets* de un panel.
 *  - `GET /v1/widgets/:id/data`: datos del *widget* para quien lo mira.
 *  - `PUT /v1/widgets/:id`, `DELETE /v1/widgets/:id`.
 *
 * Cambios de PymeKit (F2.8):
 *  - La configuración ya no es un JSON libre: `WidgetDefinitionSchema`
 *    (`@pymekit/cms-shared/dashboards`) fija tipos, columnas,
 *    agregaciones, operadores y límites, y la API comprueba que la tabla esté
 *    gestionada, no sea de un esquema protegido, sea legible por quien edita
 *    y tenga las columnas usadas.
 *  - Leer datos comprueba `has_data_permission` para quien MIRA el panel: un
 *    panel compartido no filtra datos de tablas que el lector no puede leer
 *    (403 `DASHBOARD_WIDGET_NO_ACCESS`; la interfaz muestra «sin acceso»).
 *  - Se retiran la vista previa con configuración libre y las plantillas
 *    heredadas, que creaban *widgets* sobre tablas fijas sin validarlas.
 *
 * [TFG] RF-11 · RNF-02 · ADR-013.
 */
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  DASHBOARD_MAX_POSITION_UPDATES,
  WidgetPositionSchema,
} from '@pymekit/cms-shared/dashboards';
import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

import type { WidgetData } from '../../types';
import {
  DashboardError,
  invalidDashboardInput,
  respondWithDashboardError,
} from '../dashboard-errors';
import { canReadWidgetTable } from '../services/dashboard-access';
import {
  CreateWidgetSchema,
  UpdateWidgetSchema,
  createWidgetsService,
} from '../services/widgets.service';

/** Registra las rutas de *widgets* (las concretas antes que `/:id`). */
export function registerWidgetsRoutes(router: Hono) {
  registerCreateWidgetRoute(router);
  registerUpdateWidgetPositionsRoute(router);
  registerGetWidgetDataRoute(router);
  registerUpdateWidgetRoute(router);
  registerDeleteWidgetRoute(router);
}

export type CreateWidgetRoute = ReturnType<typeof registerCreateWidgetRoute>;
export type UpdateWidgetRoute = ReturnType<typeof registerUpdateWidgetRoute>;
export type DeleteWidgetRoute = ReturnType<typeof registerDeleteWidgetRoute>;
export type GetWidgetDataRoute = ReturnType<typeof registerGetWidgetDataRoute>;
export type UpdateWidgetPositionsRoute = ReturnType<
  typeof registerUpdateWidgetPositionsRoute
>;

const WidgetParamsSchema = z.object({ id: z.uuid() });

const WidgetDataQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).optional(),
    pageSize: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

const UpdateWidgetPositionsSchema = z
  .object({
    dashboardId: z.uuid(),
    updates: z
      .array(
        z.object({ id: z.uuid(), position: WidgetPositionSchema }).strict(),
      )
      .min(1)
      .max(DASHBOARD_MAX_POSITION_UPDATES)
      .refine(
        (updates) =>
          new Set(updates.map((update) => update.id)).size === updates.length,
        { message: 'Duplicate widget ids in position update' },
      ),
  })
  .strict();

function registerCreateWidgetRoute(router: Hono) {
  return router.post(
    '/v1/widgets',
    zValidator('json', CreateWidgetSchema, invalidDashboardInput),
    async (c) => {
      try {
        const {
          _positionAdjusted,
          _originalPosition,
          _finalPosition,
          ...widget
        } = await createWidgetsService(c).createWidget(c.req.valid('json'));

        return c.json(
          {
            success: true as const,
            data: { id: widget.id, position: _finalPosition },
          },
          201,
        );
      } catch (error) {
        return respondWithDashboardError(c, error, 'widgets:create');
      }
    },
  );
}

function registerUpdateWidgetRoute(router: Hono) {
  return router.put(
    '/v1/widgets/:id',
    zValidator('param', WidgetParamsSchema, invalidDashboardInput),
    zValidator('json', UpdateWidgetSchema, invalidDashboardInput),
    async (c) => {
      const { id } = c.req.valid('param');

      try {
        const widget = await createWidgetsService(c).updateWidget(
          id,
          c.req.valid('json'),
        );

        return c.json({ success: true as const, data: { id: widget.id } });
      } catch (error) {
        return respondWithDashboardError(c, error, 'widgets:update');
      }
    },
  );
}

function registerDeleteWidgetRoute(router: Hono) {
  return router.delete(
    '/v1/widgets/:id',
    zValidator('param', WidgetParamsSchema, invalidDashboardInput),
    async (c) => {
      const { id } = c.req.valid('param');

      try {
        await createWidgetsService(c).deleteWidget(id);

        return c.json({ success: true as const });
      } catch (error) {
        return respondWithDashboardError(c, error, 'widgets:delete');
      }
    },
  );
}

function registerUpdateWidgetPositionsRoute(router: Hono) {
  return router.put(
    '/v1/widgets/positions',
    zValidator('json', UpdateWidgetPositionsSchema, invalidDashboardInput),
    async (c) => {
      const { dashboardId, updates } = c.req.valid('json');

      try {
        await createWidgetsService(c).updateWidgetPositions(
          dashboardId,
          updates,
        );

        return c.json({ success: true as const });
      } catch (error) {
        return respondWithDashboardError(c, error, 'widgets:positions');
      }
    },
  );
}

function registerGetWidgetDataRoute(router: Hono) {
  return router.get(
    '/v1/widgets/:id/data',
    zValidator('param', WidgetParamsSchema, invalidDashboardInput),
    zValidator('query', WidgetDataQuerySchema, invalidDashboardInput),
    async (c) => {
      const { id } = c.req.valid('param');
      const { page, pageSize } = c.req.valid('query');

      try {
        const service = createWidgetsService(c);
        // RLS (`select_widgets`): solo se ve si se puede acceder al panel.
        const widget = await service.getWidget(id);

        if (!widget) {
          throw new DashboardError(
            CMS_API_ERROR_CODES.DASHBOARD_WIDGET_NOT_FOUND,
          );
        }

        // [TFG] RF-11: permiso de lectura de la tabla para quien MIRA el
        // panel, en cada lectura. `queryTableData` lo vuelve a comprobar.
        if (
          !(await canReadWidgetTable(c, widget.schemaName, widget.tableName))
        ) {
          throw new DashboardError(
            CMS_API_ERROR_CODES.DASHBOARD_WIDGET_NO_ACCESS,
          );
        }

        let result: WidgetData;

        if (widget.widgetType === 'table') {
          const config = (widget.config ?? {}) as { pageSize?: number };

          result = await service.getTableWidgetDataWithFilters({
            widgetId: id,
            page: page ?? 1,
            pageSize: pageSize ?? config.pageSize ?? 10,
          });
        } else {
          result = await service.getWidgetData(id);
        }

        return c.json({
          success: true as const,
          data: {
            rows: result.data as Record<string, unknown>[],
            totalCount: result.metadata?.totalCount ?? 0,
          },
        });
      } catch (error) {
        return respondWithDashboardError(c, error, 'widgets:data');
      }
    },
  );
}
