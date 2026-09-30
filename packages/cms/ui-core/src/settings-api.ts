/**
 * Llamadas de la interfaz del CMS a Ajustes (lado cliente, F2.7a):
 * preferencias personales, obligación de MFA y miembros del personal.
 *
 * Igual que el resto de `./api`, usan el cliente RPC tipado de Hono con los
 * tipos de las rutas importados con `import type`: ningún código de servidor
 * llega al navegador. `createCmsApi` las incorpora a su objeto, así que los
 * componentes las usan con `useCmsApi().api`.
 *
 * Toda la autorización ocurre en la API y en la base de datos (permisos
 * `account`, `role` y `system_setting`, reglas de rango y cuentas raíz): la
 * interfaz solo pide y muestra lo que le devuelven.
 *
 * [TFG] RF-09 · ADR-011.
 */
import {
  createHonoClient,
  handleHonoClientResponse,
} from '@pymekit/cms-api/client';
import type {
  ActivateMemberRoute,
  DeactivateMemberRoute,
  GetMemberDetailsRoute,
  GetMembersRoute,
  MfaConfigurationRoute,
  UpdateMemberRolesRoute,
  UpdatePreferencesRoute,
} from '@pymekit/cms-settings/routes';

type ClientOptions = { fetch?: typeof fetch };

/** Página y búsqueda del listado de miembros. */
export type MembersListParams = {
  page?: number;
  search?: string;
};

/** Cambio de rol de un miembro (una cuenta tiene como mucho un rol). */
export type MemberRolesChange = {
  rolesToAdd: string[];
  rolesToRemove: string[];
};

/** Crea las funciones de acceso a los ajustes del CMS. */
export function createSettingsApi(clientOptions: ClientOptions) {
  return {
    /**
     * Guarda las preferencias personales (idioma y zona horaria); las que no
     * se envían se conservan. Lanza `ApiError` 400 con valores no válidos.
     */
    async updatePreferences(data: { language?: string; timezone?: string }) {
      const client = createHonoClient<UpdatePreferencesRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.account.preferences.$post({ json: data }),
      );
    },

    /**
     * Estado de la obligación de MFA y lo que el usuario puede hacer con
     * ella. Lanza `ApiError` 403 sin permiso `system_setting`.
     */
    async getMfaConfiguration() {
      const client = createHonoClient<MfaConfigurationRoute>(clientOptions);

      return handleHonoClientResponse(await client.v1.configuration.mfa.$get());
    },

    /**
     * Activa o desactiva la obligación de MFA. Lanza `ApiError` 403 sin
     * `system_setting:update`, sin sesión aal2 o, para desactivarla, si el
     * usuario no es cuenta raíz.
     */
    async updateMfaConfiguration(requiresMfa: boolean) {
      const client = createHonoClient<MfaConfigurationRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.configuration.mfa.$put({ json: { requiresMfa } }),
      );
    },

    /** Página del listado de miembros. Lanza `ApiError` 403 sin `account:select`. */
    async getMembers(params: MembersListParams) {
      const client = createHonoClient<GetMembersRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.members.$get({
          query: {
            ...(params.page ? { page: String(params.page) } : {}),
            ...(params.search ? { search: params.search } : {}),
          },
        }),
      );
    },

    /**
     * Ficha de un miembro con lo que el usuario puede hacer con él. Lanza
     * `ApiError` 403 sin permiso y 404 si no existe.
     */
    async getMember(id: string) {
      const client = createHonoClient<GetMemberDetailsRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.members[':id'].$get({ param: { id } }),
      );
    },

    /** Cambia el rol de un miembro (quitar el actual y/o asignar otro). */
    async updateMemberRoles(id: string, change: MemberRolesChange) {
      const client = createHonoClient<UpdateMemberRolesRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.members[':id'].roles.$post({
          param: { id },
          json: change,
        }),
      );
    },

    /** Activa o desactiva la cuenta del CMS de un miembro. */
    async setMemberActive(id: string, active: boolean) {
      if (active) {
        const client = createHonoClient<ActivateMemberRoute>(clientOptions);

        return handleHonoClientResponse(
          await client.v1.members[':id'].activate.$post({ param: { id } }),
        );
      }

      const client = createHonoClient<DeactivateMemberRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.members[':id'].deactivate.$post({ param: { id } }),
      );
    },
  };
}
