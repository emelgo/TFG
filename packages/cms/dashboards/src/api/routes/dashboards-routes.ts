import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import {
  CreateDashboardSchema,
  ShareDashboardSchema,
  UpdateDashboardSchema,
  createDashboardsService,
} from '../services/dashboards.service';

/**
 * Dashboard routes registration
 */
export function registerDashboardsRoutes(router: Hono) {
  registerGetDashboardsRoute(router);
  registerGetDashboardRoute(router);
  registerCreateDashboardRoute(router);
  registerUpdateDashboardRoute(router);
  registerDeleteDashboardRoute(router);
  registerShareDashboardRoute(router);
  registerUnshareDashboardRoute(router);
}

/**
 * Route type exports for client usage
 */
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

const DashboardParamsSchema = z.object({
  id: z.string().uuid(),
});

const ListDashboardsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  filter: z.enum(['all', 'owned', 'shared']).default('all'),
});

const ShareParamsSchema = z.object({
  id: z.string().uuid(),
  roleId: z.string().uuid(),
});

/**
 * @name registerGetDashboardsRoute
 */
function registerGetDashboardsRoute(router: Hono) {
  return router.get(
    '/v1/dashboards',
    zValidator('query', ListDashboardsQuerySchema),
    async (c) => {
      const logger = await getLogger();

      const { page, pageSize, search, filter } = c.req.valid('query');

      try {
        const service = createDashboardsService(c);

        // get all dashboards
        const result = await service.getDashboards(
          page,
          pageSize,
          search,
          filter,
        );

        return c.json({
          success: true,
          data: result,
        });
      } catch (error) {
        logger.error('Failed to get dashboards:', error);

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
 * @name registerGetDashboardRoute
 */
function registerGetDashboardRoute(router: Hono) {
  return router.get(
    '/v1/dashboards/:id',
    zValidator('param', DashboardParamsSchema),
    async (c) => {
      const logger = await getLogger();
      const { id } = c.req.valid('param');

      try {
        const service = createDashboardsService(c);

        // get dashboard by id
        const dashboard = await service.getDashboard(id);

        if (!dashboard) {
          return c.json(
            {
              success: false,
              error: 'Dashboard not found',
            },
            404,
          );
        }

        return c.json({
          success: true,
          data: dashboard,
        });
      } catch (error) {
        logger.error('Failed to get dashboard:', error);

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
 * @name registerCreateDashboardRoute
 */
function registerCreateDashboardRoute(router: Hono) {
  return router.post(
    '/v1/dashboards',
    zValidator('json', CreateDashboardSchema),
    async (c) => {
      const logger = await getLogger();
      const data = c.req.valid('json');

      try {
        const service = createDashboardsService(c);

        // create dashboard
        const dashboard = await service.createDashboard(data);

        return c.json(
          {
            success: true,
            data: dashboard,
          },
          201,
        );
      } catch (error) {
        logger.error('Failed to create dashboard:', error);
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
 * @name registerUpdateDashboardRoute
 */
function registerUpdateDashboardRoute(router: Hono) {
  return router.put(
    '/v1/dashboards/:id',
    zValidator('param', DashboardParamsSchema),
    zValidator('json', UpdateDashboardSchema),
    async (c) => {
      const logger = await getLogger();

      const { id } = c.req.valid('param');
      const data = c.req.valid('json');

      try {
        const service = createDashboardsService(c);

        // update dashboard
        const dashboard = await service.updateDashboard(id, data);

        return c.json({
          success: true,
          data: dashboard,
        });
      } catch (error) {
        logger.error('Failed to update dashboard:', error);

        if (error instanceof Error && error.message === 'Dashboard not found') {
          return c.json(
            {
              success: false,
              error: 'Dashboard not found',
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
 * @name registerDeleteDashboardRoute
 */
function registerDeleteDashboardRoute(router: Hono) {
  return router.delete(
    '/v1/dashboards/:id',
    zValidator('param', DashboardParamsSchema),
    async (c) => {
      const logger = await getLogger();
      const { id } = c.req.valid('param');

      try {
        const service = createDashboardsService(c);

        // delete dashboard from supabase
        await service.deleteDashboard(id);

        return c.json({
          success: true,
          message: 'Dashboard deleted successfully',
        });
      } catch (error) {
        logger.error('Failed to delete dashboard:', error);

        if (error instanceof Error && error.message === 'Dashboard not found') {
          return c.json(
            {
              success: false,
              error: 'Dashboard not found',
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
 * @name registerShareDashboardRoute
 */
function registerShareDashboardRoute(router: Hono) {
  return router.post(
    '/v1/dashboards/:id/share',
    zValidator('param', DashboardParamsSchema),
    zValidator('json', ShareDashboardSchema),
    async (c) => {
      const logger = await getLogger();

      const { id } = c.req.valid('param');
      const { roleId, permissionLevel } = c.req.valid('json');

      try {
        const service = createDashboardsService(c);

        // share dashboard with role
        const result = await service.shareDashboardWithRole(
          id,
          roleId,
          permissionLevel,
        );

        return c.json({
          success: true,
          data: result,
        });
      } catch (error) {
        logger.error('Failed to share dashboard:', error);

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
 * @name registerUnshareDashboardRoute
 */
function registerUnshareDashboardRoute(router: Hono) {
  return router.delete(
    '/v1/dashboards/:id/shares/:roleId',
    zValidator('param', ShareParamsSchema),
    async (c) => {
      const logger = await getLogger();

      const { id, roleId } = c.req.valid('param');

      try {
        const service = createDashboardsService(c);

        // unshare dashboard from role
        const result = await service.unshareDashboardFromRole(id, roleId);

        return c.json({
          success: true,
          data: result,
        });
      } catch (error) {
        logger.error('Failed to unshare dashboard:', error);

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
