/**
 * Rutas de Ajustes > Permisos del CMS (F2.7b): roles, grupos de permisos y
 * permisos.
 *
 * | Método y ruta                                   | Qué hace                              |
 * |-------------------------------------------------|---------------------------------------|
 * | `GET /v1/permissions`                           | Resumen: roles, grupos, permisos      |
 * | `GET /v1/permissions/catalog`                   | Tablas gestionadas para los selectores|
 * | `POST /v1/permissions/roles`                    | Crea un rol                           |
 * | `GET/PATCH/DELETE /v1/permissions/roles/:id`    | Ficha, edición y borrado de un rol    |
 * | `PUT /v1/permissions/roles/:id/groups`          | Asigna/quita grupos a un rol          |
 * | `PUT /v1/permissions/roles/:id/permissions`     | Asigna/quita permisos directos        |
 * | `POST /v1/permissions/groups`                   | Crea un grupo                         |
 * | `GET/PATCH/DELETE /v1/permissions/groups/:id`   | Ficha, edición y borrado de un grupo  |
 * | `PUT /v1/permissions/groups/:id/permissions`    | Añade/quita permisos de un grupo      |
 * | `POST /v1/permissions`                          | Crea un permiso                       |
 * | `GET/PATCH/DELETE /v1/permissions/:id`          | Ficha, edición y borrado de un permiso|
 *
 * Sustituye a las rutas heredadas, que estaban repartidas entre dos
 * paquetes y registraban `GET /v1/permissions` DOS veces (la segunda nunca
 * se alcanzaba), respondían 500 con el texto de PostgreSQL, aceptaban
 * `metadata` libre (por donde se podían colar las marcas de sistema) y
 * hacían las asignaciones en lote con varias transacciones independientes.
 * Ahora hay una sola implementación, cada petición es una transacción, los
 * esquemas son estrictos y los errores llevan un código estable
 * (`PERMISSION_*`, `ROLE_*`, `GROUP_*`).
 *
 * El orden de registro importa: las rutas con un segmento fijo
 * (`/catalog`, `/roles/...`, `/groups/...`) van antes que `/:id`, que las
 * capturaría.
 *
 * [TFG] RF-09 · RNF-02 · ADR-014 · ADR-015.
 */
import { zValidator } from '@hono/zod-validator';
import type { Context, Hono } from 'hono';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import { getLogger } from '@pymekit/shared/logger';

import { classifyRbacError } from '../lib/rbac-errors';
import {
  AssignmentChangesSchema,
  CreateGroupSchema,
  CreateRoleSchema,
  IdParamsSchema,
  PermissionInputSchema,
  UpdateGroupSchema,
  UpdateRoleSchema,
} from '../lib/rbac-schemas';
import { createRbacService } from '../services/rbac.service';

/** Responde a un error con su código estable; el original va al *log*. */
async function respondWithRbacError(
  c: Context,
  error: unknown,
  logContext: Record<string, unknown>,
) {
  const logger = await getLogger();
  const { status, errorCode, message } = classifyRbacError(error);

  if (status >= 500) {
    logger.error({ error, ...logContext }, 'RBAC request failed');
  } else {
    logger.warn({ error, ...logContext }, 'RBAC request rejected');
  }

  return c.json({ success: false as const, error: message, errorCode }, status);
}

/**
 * *Hook* de `zValidator`: 400 con código estable en lugar del volcado de
 * errores de Zod.
 */
function invalidRbacInput(result: { success: boolean }, c: Context) {
  if (!result.success) {
    return c.json(
      {
        success: false as const,
        error: 'The request is not valid',
        errorCode: CMS_API_ERROR_CODES.PERMISSION_INVALID_DATA,
      },
      400,
    );
  }
}

/** Registra `GET /v1/permissions` (resumen). */
export function registerGetRbacOverviewRoute(router: Hono) {
  return router.get('/v1/permissions', async (c) => {
    try {
      return c.json(await createRbacService(c).getOverview());
    } catch (error) {
      return respondWithRbacError(c, error, { route: 'rbac:overview' });
    }
  });
}

/** Registra `GET /v1/permissions/catalog`. */
export function registerGetRbacCatalogRoute(router: Hono) {
  return router.get('/v1/permissions/catalog', async (c) => {
    try {
      return c.json(await createRbacService(c).getCatalog());
    } catch (error) {
      return respondWithRbacError(c, error, { route: 'rbac:catalog' });
    }
  });
}

/** Registra las rutas de roles. */
export function registerRbacRoleRoutes(router: Hono) {
  return router
    .post(
      '/v1/permissions/roles',
      zValidator('json', CreateRoleSchema, invalidRbacInput),
      async (c) => {
        try {
          const data = await createRbacService(c).createRole(
            c.req.valid('json'),
          );

          return c.json({ success: true as const, data }, 201);
        } catch (error) {
          return respondWithRbacError(c, error, { route: 'rbac:role:create' });
        }
      },
    )
    .get(
      '/v1/permissions/roles/:id',
      zValidator('param', IdParamsSchema, invalidRbacInput),
      async (c) => {
        const { id } = c.req.valid('param');

        try {
          return c.json(await createRbacService(c).getRole(id));
        } catch (error) {
          return respondWithRbacError(c, error, { route: 'rbac:role', id });
        }
      },
    )
    .patch(
      '/v1/permissions/roles/:id',
      zValidator('param', IdParamsSchema, invalidRbacInput),
      zValidator('json', UpdateRoleSchema, invalidRbacInput),
      async (c) => {
        const { id } = c.req.valid('param');

        try {
          const data = await createRbacService(c).updateRole(
            id,
            c.req.valid('json'),
          );

          return c.json({ success: true as const, data });
        } catch (error) {
          return respondWithRbacError(c, error, {
            route: 'rbac:role:update',
            id,
          });
        }
      },
    )
    .delete(
      '/v1/permissions/roles/:id',
      zValidator('param', IdParamsSchema, invalidRbacInput),
      async (c) => {
        const { id } = c.req.valid('param');

        try {
          const data = await createRbacService(c).deleteRole(id);

          return c.json({ success: true as const, data });
        } catch (error) {
          return respondWithRbacError(c, error, {
            route: 'rbac:role:delete',
            id,
          });
        }
      },
    )
    .put(
      '/v1/permissions/roles/:id/groups',
      zValidator('param', IdParamsSchema, invalidRbacInput),
      zValidator('json', AssignmentChangesSchema, invalidRbacInput),
      async (c) => {
        const { id } = c.req.valid('param');
        const changes = c.req.valid('json');

        try {
          const data = await createRbacService(c).updateRoleGroups(id, changes);

          return c.json({ success: true as const, data });
        } catch (error) {
          return respondWithRbacError(c, error, {
            route: 'rbac:role:groups',
            id,
            changes,
          });
        }
      },
    )
    .put(
      '/v1/permissions/roles/:id/permissions',
      zValidator('param', IdParamsSchema, invalidRbacInput),
      zValidator('json', AssignmentChangesSchema, invalidRbacInput),
      async (c) => {
        const { id } = c.req.valid('param');
        const changes = c.req.valid('json');

        try {
          const data = await createRbacService(c).updateRolePermissions(
            id,
            changes,
          );

          return c.json({ success: true as const, data });
        } catch (error) {
          return respondWithRbacError(c, error, {
            route: 'rbac:role:permissions',
            id,
            changes,
          });
        }
      },
    );
}

/** Registra las rutas de grupos de permisos. */
export function registerRbacGroupRoutes(router: Hono) {
  return router
    .post(
      '/v1/permissions/groups',
      zValidator('json', CreateGroupSchema, invalidRbacInput),
      async (c) => {
        try {
          const data = await createRbacService(c).createGroup(
            c.req.valid('json'),
          );

          return c.json({ success: true as const, data }, 201);
        } catch (error) {
          return respondWithRbacError(c, error, {
            route: 'rbac:group:create',
          });
        }
      },
    )
    .get(
      '/v1/permissions/groups/:id',
      zValidator('param', IdParamsSchema, invalidRbacInput),
      async (c) => {
        const { id } = c.req.valid('param');

        try {
          return c.json(await createRbacService(c).getGroup(id));
        } catch (error) {
          return respondWithRbacError(c, error, { route: 'rbac:group', id });
        }
      },
    )
    .patch(
      '/v1/permissions/groups/:id',
      zValidator('param', IdParamsSchema, invalidRbacInput),
      zValidator('json', UpdateGroupSchema, invalidRbacInput),
      async (c) => {
        const { id } = c.req.valid('param');

        try {
          const data = await createRbacService(c).updateGroup(
            id,
            c.req.valid('json'),
          );

          return c.json({ success: true as const, data });
        } catch (error) {
          return respondWithRbacError(c, error, {
            route: 'rbac:group:update',
            id,
          });
        }
      },
    )
    .delete(
      '/v1/permissions/groups/:id',
      zValidator('param', IdParamsSchema, invalidRbacInput),
      async (c) => {
        const { id } = c.req.valid('param');

        try {
          const data = await createRbacService(c).deleteGroup(id);

          return c.json({ success: true as const, data });
        } catch (error) {
          return respondWithRbacError(c, error, {
            route: 'rbac:group:delete',
            id,
          });
        }
      },
    )
    .put(
      '/v1/permissions/groups/:id/permissions',
      zValidator('param', IdParamsSchema, invalidRbacInput),
      zValidator('json', AssignmentChangesSchema, invalidRbacInput),
      async (c) => {
        const { id } = c.req.valid('param');
        const changes = c.req.valid('json');

        try {
          const data = await createRbacService(c).updateGroupPermissions(
            id,
            changes,
          );

          return c.json({ success: true as const, data });
        } catch (error) {
          return respondWithRbacError(c, error, {
            route: 'rbac:group:permissions',
            id,
            changes,
          });
        }
      },
    );
}

/** Registra las rutas de permisos (después de las de roles y grupos). */
export function registerRbacPermissionRoutes(router: Hono) {
  return router
    .post(
      '/v1/permissions',
      zValidator('json', PermissionInputSchema, invalidRbacInput),
      async (c) => {
        try {
          const data = await createRbacService(c).createPermission(
            c.req.valid('json'),
          );

          return c.json({ success: true as const, data }, 201);
        } catch (error) {
          return respondWithRbacError(c, error, {
            route: 'rbac:permission:create',
          });
        }
      },
    )
    .get(
      '/v1/permissions/:id',
      zValidator('param', IdParamsSchema, invalidRbacInput),
      async (c) => {
        const { id } = c.req.valid('param');

        try {
          return c.json(await createRbacService(c).getPermission(id));
        } catch (error) {
          return respondWithRbacError(c, error, {
            route: 'rbac:permission',
            id,
          });
        }
      },
    )
    .patch(
      '/v1/permissions/:id',
      zValidator('param', IdParamsSchema, invalidRbacInput),
      zValidator('json', PermissionInputSchema, invalidRbacInput),
      async (c) => {
        const { id } = c.req.valid('param');

        try {
          const data = await createRbacService(c).updatePermission(
            id,
            c.req.valid('json'),
          );

          return c.json({ success: true as const, data });
        } catch (error) {
          return respondWithRbacError(c, error, {
            route: 'rbac:permission:update',
            id,
          });
        }
      },
    )
    .delete(
      '/v1/permissions/:id',
      zValidator('param', IdParamsSchema, invalidRbacInput),
      async (c) => {
        const { id } = c.req.valid('param');

        try {
          const data = await createRbacService(c).deletePermission(id);

          return c.json({ success: true as const, data });
        } catch (error) {
          return respondWithRbacError(c, error, {
            route: 'rbac:permission:delete',
            id,
          });
        }
      },
    );
}

/**
 * Registra todas las rutas de Ajustes > Permisos en el orden correcto
 * (segmentos fijos antes que `/:id`).
 */
export function registerRbacRoutes(router: Hono) {
  registerGetRbacOverviewRoute(router);
  registerGetRbacCatalogRoute(router);
  registerRbacRoleRoutes(router);
  registerRbacGroupRoutes(router);
  registerRbacPermissionRoutes(router);
}

export type GetRbacOverviewRoute = ReturnType<
  typeof registerGetRbacOverviewRoute
>;
export type GetRbacCatalogRoute = ReturnType<
  typeof registerGetRbacCatalogRoute
>;
export type RbacRoleRoutes = ReturnType<typeof registerRbacRoleRoutes>;
export type RbacGroupRoutes = ReturnType<typeof registerRbacGroupRoutes>;
export type RbacPermissionRoutes = ReturnType<
  typeof registerRbacPermissionRoutes
>;
