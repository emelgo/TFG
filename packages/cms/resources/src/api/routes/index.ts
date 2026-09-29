import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { createGlobalSearchService, createResourcesService } from '../services';

/**
 * Register resources routes
 * @param router - Hono router instance
 */
export function registerResourcesRoutes(router: Hono) {
  registerReadableResourcesRoute(router);
  registerGlobalSearchRoute(router);
}

/**
 * Register the readable resources route
 * GET /v1/resources - returns all readable resources for the current user
 */
function registerReadableResourcesRoute(router: Hono) {
  return router.get('/v1/resources', async (c) => {
    const service = createResourcesService(c);
    const resources = await service.getReadableResources();

    return c.json(resources);
  });
}

/**
 * Register the global search route
 * GET /v1/resources/search - search across readable resources
 */
function registerGlobalSearchRoute(router: Hono) {
  return router.get(
    '/v1/resources/search',
    zValidator(
      'query',
      z.object({
        query: z
          .string()
          .min(2)
          .transform((val) => val.trim()),
        offset: z.coerce.number().optional(),
        limit: z.coerce.number().optional(),
      }),
    ),
    async (c) => {
      const client = c.get('drizzle');
      const service = createGlobalSearchService(client);
      const params = c.req.valid('query');

      const results = await service.searchGlobal(params);

      return c.json(results);
    },
  );
}

/**
 * Type definitions for route handlers
 */
export type GetReadableResourcesRoute = ReturnType<
  typeof registerReadableResourcesRoute
>;

export type GetGlobalSearchRoute = ReturnType<typeof registerGlobalSearchRoute>;
