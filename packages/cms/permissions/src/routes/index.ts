/**
 * Rutas del RBAC del CMS (`@pymekit/cms-permissions/routes`).
 *
 *  - `GET /v1/roles` y `GET /v1/roles/sharing`: listas de roles para otras
 *    pantallas (compartir vistas guardadas y paneles).
 *  - Ajustes > Permisos (F2.7b): `registerRbacRoutes`, la ÚNICA
 *    implementación de `/v1/permissions/**` (ver `rbac-routes.ts`). Antes
 *    este paquete y `@pymekit/cms-settings` registraban cada uno su propio
 *    `GET /v1/permissions`.
 *
 * Los errores se responden con un código estable y sin el texto interno.
 *
 * [TFG] RF-09 · RNF-02.
 */
import type { Context, Hono } from 'hono';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import { getLogger } from '@pymekit/shared/logger';

import { createRolesService } from '../services';
import { registerRbacRoutes } from './rbac-routes';

export * from './rbac-routes';

/** Registra todas las rutas del paquete. */
export function registerPermissionsRoutes(router: Hono) {
  registerGetRolesRoute(router);
  registerGetRolesForSharingRoute(router);
  registerRbacRoutes(router);
}

async function respondRolesError(c: Context, error: unknown, route: string) {
  const logger = await getLogger();

  logger.error({ error, route }, 'Roles request failed');

  return c.json(
    {
      success: false as const,
      error: 'The roles could not be loaded',
      errorCode: CMS_API_ERROR_CODES.PERMISSION_ACTION_FAILED,
    },
    500,
  );
}

/** Registra `GET /v1/roles`. */
function registerGetRolesRoute(router: Hono) {
  return router.get('/v1/roles', async (c) => {
    try {
      const roles = await createRolesService(c).getRoles();

      return c.json({ roles });
    } catch (error) {
      return respondRolesError(c, error, 'roles');
    }
  });
}

/** Registra `GET /v1/roles/sharing`. */
function registerGetRolesForSharingRoute(router: Hono) {
  return router.get('/v1/roles/sharing', async (c) => {
    try {
      const roles = await createRolesService(c).getRolesForSharing();

      return c.json({ roles });
    } catch (error) {
      return respondRolesError(c, error, 'roles:sharing');
    }
  });
}

export type GetRolesRoute = ReturnType<typeof registerGetRolesRoute>;
export type GetRolesForSharingRoute = ReturnType<
  typeof registerGetRolesForSharingRoute
>;
