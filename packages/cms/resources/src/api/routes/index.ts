/**
 * Rutas Hono de los recursos del CMS: tablas legibles por el usuario y
 * búsqueda global (F2.6).
 *
 * [TFG] RF-09.
 */
import { zValidator } from '@hono/zod-validator';
import type { Hono } from 'hono';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import { getLogger } from '@pymekit/shared/logger';

import { createGlobalSearchService, createResourcesService } from '../services';
import { GlobalSearchQuerySchema } from '../utils/global-search';

/**
 * Registra las rutas de recursos: tablas legibles y búsqueda global.
 */
export function registerResourcesRoutes(router: Hono) {
  registerReadableResourcesRoute(router);
  registerGlobalSearchRoute(router);
}

/** `GET /v1/resources`: tablas que el usuario puede leer. */
function registerReadableResourcesRoute(router: Hono) {
  return router.get('/v1/resources', async (c) => {
    const service = createResourcesService(c);
    const resources = await service.getReadableResources();

    return c.json(resources);
  });
}

/**
 * `GET /v1/resources/search`: búsqueda global en las tablas legibles (paleta
 * Cmd/Ctrl+K de la interfaz).
 *
 * Limita el texto (2–100 caracteres) y el número de resultados (máximo 20)
 * y responde a cualquier fallo con un código estable
 * (`GLOBAL_SEARCH_INVALID_QUERY`, `GLOBAL_SEARCH_FAILED`) sin el texto de
 * PostgreSQL, que antes llegaba al cliente dentro de la respuesta.
 */
function registerGlobalSearchRoute(router: Hono) {
  return router.get(
    '/v1/resources/search',
    zValidator('query', GlobalSearchQuerySchema, (result, c) => {
      if (!result.success) {
        return c.json(
          {
            success: false as const,
            error: 'The search query is not valid',
            errorCode: CMS_API_ERROR_CODES.GLOBAL_SEARCH_INVALID_QUERY,
          },
          400,
        );
      }
    }),
    async (c) => {
      const service = createGlobalSearchService(c.get('drizzle'));

      try {
        return c.json(await service.searchGlobal(c.req.valid('query')));
      } catch (error) {
        const logger = await getLogger();

        logger.error({ error }, 'Global search failed');

        return c.json(
          {
            success: false as const,
            error: 'The search could not be completed',
            errorCode: CMS_API_ERROR_CODES.GLOBAL_SEARCH_FAILED,
          },
          500,
        );
      }
    },
  );
}

/** Tipos de las rutas para el cliente RPC tipado. */
export type GetReadableResourcesRoute = ReturnType<
  typeof registerReadableResourcesRoute
>;

export type GetGlobalSearchRoute = ReturnType<typeof registerGlobalSearchRoute>;
