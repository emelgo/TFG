/**
 * Llamadas de la interfaz del CMS al explorador de usuarios (lado cliente).
 *
 * Igual que el resto de `./api`, usan el cliente RPC tipado de Hono con los
 * tipos de las rutas importados con `import type`: ningún código de servidor
 * llega al navegador. `createCmsApi` las incorpora a su objeto, así que los
 * componentes las usan con `useCmsApi().api`.
 *
 * La interfaz solo **propone** acciones: la API vuelve a comprobar el permiso
 * del RBAC del CMS y la protección del usuario de destino en cada llamada.
 *
 * [TFG] RF-09 · ADR-011.
 */
import {
  createHonoClient,
  handleHonoClientResponse,
} from '@pymekit/cms-api/client';
import type {
  BanUserRoute,
  BatchBanUsersRoute,
  BatchDeleteUsersRoute,
  BatchResetPasswordsRoute,
  BatchUnbanUsersRoute,
  CreateUserRoute,
  DeleteUserRoute,
  GetUserByIdRoute,
  GetUsersRoute,
  InviteUserRoute,
  RemoveMfaFactorRoute,
  ResetPasswordRoute,
  SendMagicLinkRoute,
  UnbanUserRoute,
  UpdateAdminAccessRoute,
} from '@pymekit/cms-users-explorer/routes';

type ClientOptions = { fetch?: typeof fetch };

/** Acciones que se pueden aplicar a varios usuarios a la vez. */
export type UsersBatchAction = 'ban' | 'unban' | 'resetPassword' | 'delete';

/** Parámetros del listado de usuarios. */
export type UsersListParams = { page?: number; search?: string };

/** Crea las funciones de acceso al explorador de usuarios. */
export function createUsersApi(clientOptions: ClientOptions) {
  return {
    /** Página de usuarios (25 por página) con búsqueda por correo o teléfono. */
    async getUsers(params: UsersListParams) {
      const client = createHonoClient<GetUsersRoute>(clientOptions);

      const response = await client.v1.users.$get({
        query: {
          ...(params.page && params.page > 1
            ? { page: String(params.page) }
            : {}),
          ...(params.search ? { search: params.search } : {}),
        },
      });

      return handleHonoClientResponse(response);
    },

    /**
     * Ficha de un usuario con sus permisos y las acciones disponibles.
     * Lanza `ApiError` 403 sin permiso y 404 si no existe.
     */
    async getUser(id: string) {
      const client = createHonoClient<GetUserByIdRoute>(clientOptions);

      const response = await client.v1.users[':id'].$get({ param: { id } });

      return handleHonoClientResponse(response);
    },

    async banUser(id: string) {
      const client = createHonoClient<BanUserRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.admin.users[':id'].ban.$post({ param: { id } }),
      );
    },

    async unbanUser(id: string) {
      const client = createHonoClient<UnbanUserRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.admin.users[':id'].unban.$post({ param: { id } }),
      );
    },

    /** Envía al usuario un correo para restablecer su contraseña. */
    async resetUserPassword(id: string) {
      const client = createHonoClient<ResetPasswordRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.admin.users[':id']['reset-password'].$post({
          param: { id },
        }),
      );
    },

    async deleteUser(id: string) {
      const client = createHonoClient<DeleteUserRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.admin.users[':id'].$delete({ param: { id } }),
      );
    },

    /** Envía al correo del usuario un enlace de recuperación o invitación. */
    async sendUserMagicLink(id: string, type: 'recovery' | 'invite') {
      const client = createHonoClient<SendMagicLinkRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.admin.users[':id']['magic-link'].$post({
          param: { id },
          json: { type },
        }),
      );
    },

    async removeUserMfaFactor(id: string, factorId: string) {
      const client = createHonoClient<RemoveMfaFactorRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.admin.users[':id'].mfa[':factorId'].$delete({
          param: { id, factorId },
        }),
      );
    },

    /** Concede (`true`) o retira (`false`) el acceso al CMS. */
    async updateUserAdminAccess(id: string, adminAccess: boolean) {
      const client = createHonoClient<UpdateAdminAccessRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.admin.users[':id']['admin-access'].$put({
          param: { id },
          json: { adminAccess },
        }),
      );
    },

    async createUser(data: {
      email: string;
      password: string;
      autoConfirm: boolean;
    }) {
      const client = createHonoClient<CreateUserRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.admin.users.create.$post({ json: data }),
      );
    },

    async inviteUser(email: string) {
      const client = createHonoClient<InviteUserRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.admin.users.invite.$post({ json: { email } }),
      );
    },

    /**
     * Aplica una acción a varios usuarios. La respuesta dice cuántos se
     * procesaron y el código del motivo de cada fallo.
     */
    async batchUsersAction(action: UsersBatchAction, userIds: string[]) {
      const json = { userIds };

      switch (action) {
        case 'ban': {
          const client = createHonoClient<BatchBanUsersRoute>(clientOptions);

          return handleHonoClientResponse(
            await client.v1.admin.users.ban.batch.$post({ json }),
          );
        }
        case 'unban': {
          const client = createHonoClient<BatchUnbanUsersRoute>(clientOptions);

          return handleHonoClientResponse(
            await client.v1.admin.users.unban.batch.$post({ json }),
          );
        }
        case 'resetPassword': {
          const client =
            createHonoClient<BatchResetPasswordsRoute>(clientOptions);

          return handleHonoClientResponse(
            await client.v1.admin.users['reset-password'].batch.$post({
              json,
            }),
          );
        }
        case 'delete': {
          const client = createHonoClient<BatchDeleteUsersRoute>(clientOptions);

          return handleHonoClientResponse(
            await client.v1.admin.users.delete.batch.$post({ json }),
          );
        }
      }
    },
  };
}
