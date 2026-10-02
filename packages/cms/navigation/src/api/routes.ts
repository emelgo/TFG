import { Hono } from 'hono';

import { createResourcesService } from '@pymekit/cms-resources/services';
import { getLogger } from '@pymekit/shared/logger';

/**
 * @name registerNavigationRoutes
 * @description Register the navigation router
 * @param router
 */
export function registerNavigationRoutes(router: Hono) {
  registerNavigationRoute(router);
}

/**
 * @name registerNavigationRoute
 * @description Create the get navigation route
 * @param router
 */
function registerNavigationRoute(router: Hono) {
  return router.get('/v1/navigation', async (c) => {
    const logger = await getLogger();

    try {
      const service = createResourcesService(c);
      const items = await service.getReadableResources();

      return c.json(items);
    } catch (error) {
      logger.error({ error }, 'Error loading navigation items:');

      return c.json({ error: 'Failed to load navigation items' }, 500);
    }
  });
}

/**
 * @name GetNavigationRoute
 * @description The type of the navigation router.
 * This is used to type the navigation router in the context variable map.
 *
 */
export type GetNavigationRoute = ReturnType<typeof registerNavigationRoute>;
