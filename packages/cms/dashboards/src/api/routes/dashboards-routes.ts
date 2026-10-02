/**
 * Rutas de los paneles del CMS (`/v1/dashboards/**`).
 *
 *  - `GET /v1/dashboards`: paneles propios y compartidos (búsqueda y filtro).
 *  - `GET /v1/dashboards/:id`: panel, *widgets*, `canEdit`/`canManage` y,
 *    para el propietario, sus comparticiones.
 *  - `POST /v1/dashboards`, `PUT /v1/dashboards/:id`, `DELETE …/:id`.
 *  - `POST /v1/dashboards/:id/share`, `DELETE …/:id/shares/:roleId`.
 *
 * Cambios de PymeKit (F2.8): esquemas Zod estrictos, comprobación previa de
 * acceso (404 sin acceso, 403 sin permiso de edición o de propietario) y
 * errores con código estable `DASHBOARD_*`, sin el texto de PostgreSQL.
 * La base de datos (RLS y funciones `cms.*_dashboard*`) sigue siendo la
 * autoridad.
 *
 * [TFG] RF-11 · RNF-02 · ADR-013.
 */
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

import {
  DashboardError,
  invalidDashboardInput,
  respondWithDashboardError,
} from '../dashboard-errors';
import {
  CreateDashboardSchema,
  ShareDashboardSchema,
  UpdateDashboardSchema,
  createDashboardsService,
} from '../services/dashboards.service';

/** Registra todas las rutas de paneles. */
export function registerDashboardsRoutes(router: Hono) {
  registerGetDashboardsRoute(router);
  registerGetDashboardRoute(router);
  registerCreateDashboardRoute(router);
  registerUpdateDashboardRoute(router);
  registerDeleteDashboardRoute(router);
  registerShareDashboardRoute(router);
  registerUnshareDashboardRoute(router);
}

export type GetDashboardsRoute = ReturnType<typeof registerGetDashboardsRoute>;
export type GetDashboardRoute = ReturnType<typeof registerGetDashboardRoute>;
export type CreateDashboardRoute = ReturnType<
  typeof registerCreateDashboardRoute
>;
export type UpdateDashboardRoute = ReturnType<
  typeof registerUpdateDashboardRoute
>;
export type DeleteDashboardRoute = ReturnType<
  typeof registerDeleteDashboardRoute
>;
export type ShareDashboardRoute = ReturnType<
  typeof registerShareDashboardRoute
>;
export type UnshareDashboardRoute = ReturnType<
  typeof registerUnshareDashboardRoute
>;

const DashboardParamsSchema = z.object({ id: z.uuid() });

const ListDashboardsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    filter: z.enum(['all', 'owned', 'shared']).default('all'),
  })
  .strict();

const ShareParamsSchema = z.object({ id: z.uuid(), roleId: z.uuid() });

function registerGetDashboardsRoute(router: Hono) {
  return router.get(
    '/v1/dashboards',
    zValidator('query', ListDashboardsQuerySchema, invalidDashboardInput),
    async (c) => {
      const { page, pageSize, search, filter } = c.req.valid('query');

      try {
        const result = await createDashboardsService(c).getDashboards(
          page,
          pageSize,
          search || undefined,
          filter,
        );

        return c.json({ success: true as const, data: result });
      } catch (error) {
        return respondWithDashboardError(c, error, 'dashboards:list');
      }
    },
  );
}

function registerGetDashboardRoute(router: Hono) {
  return router.get(
    '/v1/dashboards/:id',
    zValidator('param', DashboardParamsSchema, invalidDashboardInput),
    async (c) => {
      const { id } = c.req.valid('param');

      try {
        const dashboard = await createDashboardsService(c).getDashboard(id);

        if (!dashboard) {
          throw new DashboardError(CMS_API_ERROR_CODES.DASHBOARD_NOT_FOUND);
        }

        return c.json({ success: true as const, data: dashboard });
      } catch (error) {
        return respondWithDashboardError(c, error, 'dashboards:get');
      }
    },
  );
}

function registerCreateDashboardRoute(router: Hono) {
  return router.post(
    '/v1/dashboards',
    zValidator('json', CreateDashboardSchema, invalidDashboardInput),
    async (c) => {
      try {
        const dashboard = await createDashboardsService(c).createDashboard(
          c.req.valid('json'),
        );

        return c.json(
          {
            success: true as const,
            data: dashboard as { id: string; name: string },
          },
          201,
        );
      } catch (error) {
        return respondWithDashboardError(c, error, 'dashboards:create');
      }
    },
  );
}

function registerUpdateDashboardRoute(router: Hono) {
  return router.put(
    '/v1/dashboards/:id',
    zValidator('param', DashboardParamsSchema, invalidDashboardInput),
    zValidator('json', UpdateDashboardSchema, invalidDashboardInput),
    async (c) => {
      const { id } = c.req.valid('param');

      try {
        const dashboard = await createDashboardsService(c).updateDashboard(
          id,
          c.req.valid('json'),
        );

        return c.json({ success: true as const, data: dashboard });
      } catch (error) {
        return respondWithDashboardError(c, error, 'dashboards:update');
      }
    },
  );
}

function registerDeleteDashboardRoute(router: Hono) {
  return router.delete(
    '/v1/dashboards/:id',
    zValidator('param', DashboardParamsSchema, invalidDashboardInput),
    async (c) => {
      const { id } = c.req.valid('param');

      try {
        await createDashboardsService(c).deleteDashboard(id);

        return c.json({ success: true as const });
      } catch (error) {
        return respondWithDashboardError(c, error, 'dashboards:delete');
      }
    },
  );
}

function registerShareDashboardRoute(router: Hono) {
  return router.post(
    '/v1/dashboards/:id/share',
    zValidator('param', DashboardParamsSchema, invalidDashboardInput),
    zValidator('json', ShareDashboardSchema, invalidDashboardInput),
    async (c) => {
      const { id } = c.req.valid('param');
      const { roleId, permissionLevel } = c.req.valid('json');

      try {
        const share = await createDashboardsService(c).shareDashboardWithRole(
          id,
          roleId,
          permissionLevel,
        );

        return c.json({ success: true as const, data: share });
      } catch (error) {
        return respondWithDashboardError(c, error, 'dashboards:share');
      }
    },
  );
}

function registerUnshareDashboardRoute(router: Hono) {
  return router.delete(
    '/v1/dashboards/:id/shares/:roleId',
    zValidator('param', ShareParamsSchema, invalidDashboardInput),
    async (c) => {
      const { id, roleId } = c.req.valid('param');

      try {
        await createDashboardsService(c).unshareDashboardFromRole(id, roleId);

        return c.json({ success: true as const });
      } catch (error) {
        return respondWithDashboardError(c, error, 'dashboards:unshare');
      }
    },
  );
}
