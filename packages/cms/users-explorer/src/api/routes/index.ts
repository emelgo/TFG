/**
 * Rutas Hono del explorador de usuarios del CMS (`/v1/users`,
 * `/v1/admin/users/...`).
 *
 * Lectura:
 *  - `GET /v1/users`: página de usuarios con búsqueda por correo o teléfono.
 *  - `GET /v1/users/:id`: ficha de un usuario y acciones disponibles.
 *
 * Acciones (todas pasan por `AdminUserService`, que comprueba permiso y
 * protección antes de usar la clave de servicio de Auth):
 *  - crear, invitar, bloquear, desbloquear, restablecer contraseña, enviar
 *    enlace de acceso, quitar un factor MFA y borrar (una o varias);
 *  - conceder o retirar el acceso al CMS (`PUT .../admin-access`).
 *
 * **No existe** ningún *endpoint* para editar metadatos de un usuario: el
 * `app_metadata` (con `role` y `cms_access`) no se puede escribir desde el
 * CMS. Los esquemas Zod son estrictos (`.strict()`), así que un campo de más
 * en el cuerpo (por ejemplo, `app_metadata`) se rechaza con 400 en lugar de
 * ignorarse en silencio.
 *
 * Los errores se responden con un código estable (`AUTH_USER_*`) y un mensaje
 * genérico (`classifyUsersError`); el texto de Auth o de PostgreSQL solo va
 * al *log*.
 *
 * [TFG] RF-09 · RNF-02.
 */
import { zValidator } from '@hono/zod-validator';
import type { Context, Hono } from 'hono';
import { z } from 'zod';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import { getLogger } from '@pymekit/shared/logger';

import { createAdminUserService } from '../services/admin-user.service';
import { createAuthUsersService } from '../services/auth-users.service';
import { classifyUsersError } from '../utils/users-errors';

/** Tamaño de página del listado de usuarios. */
const USERS_PAGE_SIZE = 25;

/** Máximo de usuarios por acción múltiple. */
const MAX_BATCH_USERS = 50;

const UserIdParamsSchema = z.object({ id: z.string().uuid() });

const BatchUsersSchema = z
  .object({
    userIds: z.array(z.string().uuid()).min(1).max(MAX_BATCH_USERS),
  })
  .strict();

/**
 * Respuesta de los validadores Zod cuando la entrada no es válida (un campo
 * de más, un id que no es UUID, una contraseña corta…): un 400 con el código
 * estable `AUTH_USER_INVALID_DATA`, igual para todas las rutas.
 */
function invalidUsersInput(result: { success: boolean }, c: Context) {
  if (!result.success) {
    return c.json(
      {
        success: false as const,
        error: 'The submitted user data is not valid',
        errorCode: CMS_API_ERROR_CODES.AUTH_USER_INVALID_DATA,
      },
      400,
    );
  }
}

/**
 * Responde a un error del explorador con su código estable. El error
 * original solo va al *log*.
 */
async function respondWithUsersError(
  c: Context,
  error: unknown,
  logContext: Record<string, unknown>,
  logMessage: string,
) {
  const logger = await getLogger();
  const { status, errorCode, message } = classifyUsersError(error);

  if (status >= 500) {
    logger.error({ error, ...logContext }, logMessage);
  } else {
    logger.warn({ error, ...logContext }, logMessage);
  }

  return c.json({ success: false, error: message, errorCode }, status);
}

/** Registra todas las rutas del explorador de usuarios. */
export function registerUsersExplorerRoutes(router: Hono) {
  registerGetUsersRoute(router);
  registerGetUserByIdRoute(router);

  registerBanUserRoute(router);
  registerUnbanUserRoute(router);
  registerResetPasswordRoute(router);
  registerDeleteUserRoute(router);
  registerInviteUserRoute(router);
  registerCreateUserRoute(router);
  registerSendMagicLinkRoute(router);
  registerRemoveMfaFactorRoute(router);
  registerUpdateAdminAccessRoute(router);

  registerBatchBanUsersRoute(router);
  registerBatchUnbanUsersRoute(router);
  registerBatchResetPasswordsRoute(router);
  registerBatchDeleteUsersRoute(router);
}

function registerGetUsersRoute(router: Hono) {
  return router.get(
    '/v1/users',
    zValidator(
      'query',
      z.object({
        page: z.coerce.number().int().min(1).optional().default(1),
        search: z.string().max(255).optional(),
      }),
      invalidUsersInput,
    ),
    async (c) => {
      const service = createAuthUsersService(c);
      const { page, search } = c.req.valid('query');

      try {
        const [{ users, total }, permissions] = await Promise.all([
          service.getUsers({ page, limit: USERS_PAGE_SIZE, search }),
          service.getPermissions(),
        ]);

        return c.json({
          users,
          permissions,
          pagination: {
            pageCount: Math.ceil(total / USERS_PAGE_SIZE),
            pageIndex: page - 1,
            pageSize: USERS_PAGE_SIZE,
            total,
          },
        });
      } catch (error) {
        return respondWithUsersError(c, error, {}, 'Failed to fetch users');
      }
    },
  );
}

function registerGetUserByIdRoute(router: Hono) {
  return router.get(
    '/v1/users/:id',
    zValidator('param', UserIdParamsSchema, invalidUsersInput),
    async (c) => {
      const { id } = c.req.valid('param');

      try {
        const data = await createAuthUsersService(c).getUserById(id);

        return c.json({ data });
      } catch (error) {
        return respondWithUsersError(
          c,
          error,
          { userId: id },
          'Failed to fetch user details',
        );
      }
    },
  );
}

function registerBanUserRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/:id/ban',
    zValidator('param', UserIdParamsSchema, invalidUsersInput),
    async (c) => {
      const { id } = c.req.valid('param');

      try {
        return c.json(await createAdminUserService(c).banUsers([id]));
      } catch (error) {
        return respondWithUsersError(c, error, { userId: id }, 'Ban failed');
      }
    },
  );
}

function registerUnbanUserRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/:id/unban',
    zValidator('param', UserIdParamsSchema, invalidUsersInput),
    async (c) => {
      const { id } = c.req.valid('param');

      try {
        return c.json(await createAdminUserService(c).unbanUsers([id]));
      } catch (error) {
        return respondWithUsersError(c, error, { userId: id }, 'Unban failed');
      }
    },
  );
}

function registerResetPasswordRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/:id/reset-password',
    zValidator('param', UserIdParamsSchema, invalidUsersInput),
    async (c) => {
      const { id } = c.req.valid('param');

      try {
        return c.json(await createAdminUserService(c).resetPasswords([id]));
      } catch (error) {
        return respondWithUsersError(
          c,
          error,
          { userId: id },
          'Password reset failed',
        );
      }
    },
  );
}

function registerDeleteUserRoute(router: Hono) {
  return router.delete(
    '/v1/admin/users/:id',
    zValidator('param', UserIdParamsSchema, invalidUsersInput),
    async (c) => {
      const { id } = c.req.valid('param');

      try {
        return c.json(await createAdminUserService(c).deleteUsers([id]));
      } catch (error) {
        return respondWithUsersError(c, error, { userId: id }, 'Delete failed');
      }
    },
  );
}

function registerInviteUserRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/invite',
    zValidator(
      'json',
      z.object({ email: z.string().email() }).strict(),
      invalidUsersInput,
    ),
    async (c) => {
      const { email } = c.req.valid('json');

      try {
        return c.json(await createAdminUserService(c).inviteUser({ email }));
      } catch (error) {
        return respondWithUsersError(c, error, {}, 'Invite failed');
      }
    },
  );
}

function registerCreateUserRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/create',
    zValidator(
      'json',
      z
        .object({
          email: z.string().email(),
          // 72 es el máximo que admite bcrypt, el algoritmo de Auth.
          password: z.string().min(8).max(72),
          autoConfirm: z.boolean().default(false),
        })
        .strict(),
      invalidUsersInput,
    ),
    async (c) => {
      const { email, password, autoConfirm } = c.req.valid('json');

      try {
        return c.json(
          await createAdminUserService(c).createUser({
            email,
            password,
            autoConfirm,
          }),
        );
      } catch (error) {
        return respondWithUsersError(c, error, {}, 'Create user failed');
      }
    },
  );
}

function registerBatchBanUsersRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/ban/batch',
    zValidator('json', BatchUsersSchema, invalidUsersInput),
    async (c) => {
      const { userIds } = c.req.valid('json');

      try {
        return c.json(await createAdminUserService(c).banUsers(userIds));
      } catch (error) {
        return respondWithUsersError(c, error, { userIds }, 'Batch ban failed');
      }
    },
  );
}

function registerBatchUnbanUsersRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/unban/batch',
    zValidator('json', BatchUsersSchema, invalidUsersInput),
    async (c) => {
      const { userIds } = c.req.valid('json');

      try {
        return c.json(await createAdminUserService(c).unbanUsers(userIds));
      } catch (error) {
        return respondWithUsersError(
          c,
          error,
          { userIds },
          'Batch unban failed',
        );
      }
    },
  );
}

function registerBatchResetPasswordsRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/reset-password/batch',
    zValidator('json', BatchUsersSchema, invalidUsersInput),
    async (c) => {
      const { userIds } = c.req.valid('json');

      try {
        return c.json(await createAdminUserService(c).resetPasswords(userIds));
      } catch (error) {
        return respondWithUsersError(
          c,
          error,
          { userIds },
          'Batch password reset failed',
        );
      }
    },
  );
}

function registerBatchDeleteUsersRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/delete/batch',
    zValidator('json', BatchUsersSchema, invalidUsersInput),
    async (c) => {
      const { userIds } = c.req.valid('json');

      try {
        return c.json(await createAdminUserService(c).deleteUsers(userIds));
      } catch (error) {
        return respondWithUsersError(
          c,
          error,
          { userIds },
          'Batch delete failed',
        );
      }
    },
  );
}

function registerSendMagicLinkRoute(router: Hono) {
  return router.post(
    '/v1/admin/users/:id/magic-link',
    zValidator('param', UserIdParamsSchema, invalidUsersInput),
    zValidator(
      'json',
      z
        .object({
          type: z.enum(['recovery', 'invite']).default('recovery'),
        })
        .strict(),
      invalidUsersInput,
    ),
    async (c) => {
      const { id } = c.req.valid('param');
      const { type } = c.req.valid('json');

      try {
        return c.json(await createAdminUserService(c).sendMagicLink(id, type));
      } catch (error) {
        return respondWithUsersError(
          c,
          error,
          { userId: id, type },
          'Magic link failed',
        );
      }
    },
  );
}

function registerRemoveMfaFactorRoute(router: Hono) {
  return router.delete(
    '/v1/admin/users/:id/mfa/:factorId',
    zValidator(
      'param',
      z.object({ id: z.string().uuid(), factorId: z.string().uuid() }),
      invalidUsersInput,
    ),
    async (c) => {
      const { id, factorId } = c.req.valid('param');

      try {
        return c.json(
          await createAdminUserService(c).removeMfaFactor(id, factorId),
        );
      } catch (error) {
        return respondWithUsersError(
          c,
          error,
          { userId: id, factorId },
          'Remove MFA factor failed',
        );
      }
    },
  );
}

function registerUpdateAdminAccessRoute(router: Hono) {
  return router.put(
    '/v1/admin/users/:id/admin-access',
    zValidator('param', UserIdParamsSchema, invalidUsersInput),
    zValidator(
      'json',
      z.object({ adminAccess: z.boolean() }).strict(),
      invalidUsersInput,
    ),
    async (c) => {
      const { id } = c.req.valid('param');
      const { adminAccess } = c.req.valid('json');

      try {
        return c.json(
          await createAdminUserService(c).updateAdminAccess(id, adminAccess),
        );
      } catch (error) {
        return respondWithUsersError(
          c,
          error,
          { userId: id, adminAccess },
          'Update admin access failed',
        );
      }
    },
  );
}

export type GetUsersRoute = ReturnType<typeof registerGetUsersRoute>;
export type GetUserByIdRoute = ReturnType<typeof registerGetUserByIdRoute>;
export type BanUserRoute = ReturnType<typeof registerBanUserRoute>;
export type UnbanUserRoute = ReturnType<typeof registerUnbanUserRoute>;
export type ResetPasswordRoute = ReturnType<typeof registerResetPasswordRoute>;
export type DeleteUserRoute = ReturnType<typeof registerDeleteUserRoute>;
export type InviteUserRoute = ReturnType<typeof registerInviteUserRoute>;
export type CreateUserRoute = ReturnType<typeof registerCreateUserRoute>;
export type BatchBanUsersRoute = ReturnType<typeof registerBatchBanUsersRoute>;
export type BatchUnbanUsersRoute = ReturnType<
  typeof registerBatchUnbanUsersRoute
>;
export type BatchResetPasswordsRoute = ReturnType<
  typeof registerBatchResetPasswordsRoute
>;
export type BatchDeleteUsersRoute = ReturnType<
  typeof registerBatchDeleteUsersRoute
>;
export type SendMagicLinkRoute = ReturnType<typeof registerSendMagicLinkRoute>;
export type RemoveMfaFactorRoute = ReturnType<
  typeof registerRemoveMfaFactorRoute
>;
export type UpdateAdminAccessRoute = ReturnType<
  typeof registerUpdateAdminAccessRoute
>;
