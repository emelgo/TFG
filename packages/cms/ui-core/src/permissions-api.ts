/**
 * Llamadas de la interfaz del CMS a Ajustes > Permisos (lado cliente,
 * F2.7b): roles, grupos de permisos y permisos.
 *
 * Igual que el resto de `./api`, usan el cliente RPC tipado de Hono con los
 * tipos de las rutas importados con `import type`: ningún código de
 * servidor llega al navegador. `createCmsApi` las incorpora a su objeto, así
 * que los componentes las usan con `useCmsApi().api`.
 *
 * Toda la autorización ocurre en la API y en la base de datos (permisos
 * `role` y `permission`, reglas de rango, «solo se concede lo que uno
 * tiene» y la guardia de los objetos de sistema): la interfaz solo pide y
 * muestra lo que le devuelven, incluido qué acciones ofrecer (`access`).
 *
 * [TFG] RF-09 · ADR-011 · ADR-015.
 */
import {
  createHonoClient,
  handleHonoClientResponse,
} from '@pymekit/cms-api/client';
import type {
  GetRbacCatalogRoute,
  GetRbacOverviewRoute,
  RbacGroupRoutes,
  RbacPermissionRoutes,
  RbacRoleRoutes,
} from '@pymekit/cms-permissions/routes';

type ClientOptions = { fetch?: typeof fetch };

/** Ids que añadir y quitar en una asignación (grupos o permisos). */
export type RbacAssignmentChanges = { toAdd: string[]; toRemove: string[] };

/** Datos de un rol al crearlo o editarlo. */
export type RbacRoleInput = {
  name: string;
  description: string | null;
  rank: number;
};

/** Datos de un grupo al crearlo o editarlo. */
export type RbacGroupInput = { name: string; description: string | null };

/**
 * Definición de un permiso (la misma forma que valida la API con
 * `PermissionInputSchema`).
 */
export type RbacPermissionInput =
  | {
      permissionType: 'system';
      name: string;
      description: string | null;
      action: RbacActionValue;
      systemResource: RbacSystemResourceValue;
    }
  | {
      permissionType: 'data';
      scope: 'table';
      name: string;
      description: string | null;
      action: RbacActionValue;
      schemaName: string;
      tableName: string;
    }
  | {
      permissionType: 'data';
      scope: 'column';
      name: string;
      description: string | null;
      action: RbacActionValue;
      schemaName: string;
      tableName: string;
      columnName: string;
    }
  | {
      permissionType: 'data';
      scope: 'storage';
      name: string;
      description: string | null;
      action: RbacActionValue;
      bucketName: string;
      pathPattern: string;
    };

type RbacActionValue = '*' | 'select' | 'insert' | 'update' | 'delete';

type RbacSystemResourceValue =
  | 'account'
  | 'role'
  | 'permission'
  | 'log'
  | 'table'
  | 'auth_user'
  | 'system_setting';

/** Crea las funciones de acceso a Ajustes > Permisos. */
export function createPermissionsApi(clientOptions: ClientOptions) {
  const roles = () => createHonoClient<RbacRoleRoutes>(clientOptions);
  const groups = () => createHonoClient<RbacGroupRoutes>(clientOptions);
  const permissions = () =>
    createHonoClient<RbacPermissionRoutes>(clientOptions);

  return {
    /**
     * Resumen del RBAC: roles, grupos y permisos visibles y qué puede crear
     * el usuario. Lanza `ApiError` 403 sin `role:select` ni
     * `permission:select`.
     */
    async getRbacOverview() {
      const client = createHonoClient<GetRbacOverviewRoute>(clientOptions);

      return handleHonoClientResponse(await client.v1.permissions.$get());
    },

    /** Tablas gestionadas (y sus columnas) para el formulario de permisos. */
    async getRbacCatalog() {
      const client = createHonoClient<GetRbacCatalogRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.permissions.catalog.$get(),
      );
    },

    /** Ficha de un rol. Lanza `ApiError` 403/404. */
    async getRbacRole(id: string) {
      return handleHonoClientResponse(
        await roles().v1.permissions.roles[':id'].$get({ param: { id } }),
      );
    },

    async createRbacRole(json: RbacRoleInput) {
      return handleHonoClientResponse(
        await roles().v1.permissions.roles.$post({ json }),
      );
    },

    async updateRbacRole(id: string, json: Partial<RbacRoleInput>) {
      return handleHonoClientResponse(
        await roles().v1.permissions.roles[':id'].$patch({
          param: { id },
          json,
        }),
      );
    },

    async deleteRbacRole(id: string) {
      return handleHonoClientResponse(
        await roles().v1.permissions.roles[':id'].$delete({ param: { id } }),
      );
    },

    async updateRbacRoleGroups(id: string, json: RbacAssignmentChanges) {
      return handleHonoClientResponse(
        await roles().v1.permissions.roles[':id'].groups.$put({
          param: { id },
          json,
        }),
      );
    },

    async updateRbacRolePermissions(id: string, json: RbacAssignmentChanges) {
      return handleHonoClientResponse(
        await roles().v1.permissions.roles[':id'].permissions.$put({
          param: { id },
          json,
        }),
      );
    },

    /** Ficha de un grupo de permisos. Lanza `ApiError` 403/404. */
    async getRbacGroup(id: string) {
      return handleHonoClientResponse(
        await groups().v1.permissions.groups[':id'].$get({ param: { id } }),
      );
    },

    async createRbacGroup(json: RbacGroupInput) {
      return handleHonoClientResponse(
        await groups().v1.permissions.groups.$post({ json }),
      );
    },

    async updateRbacGroup(id: string, json: Partial<RbacGroupInput>) {
      return handleHonoClientResponse(
        await groups().v1.permissions.groups[':id'].$patch({
          param: { id },
          json,
        }),
      );
    },

    async deleteRbacGroup(id: string) {
      return handleHonoClientResponse(
        await groups().v1.permissions.groups[':id'].$delete({ param: { id } }),
      );
    },

    async updateRbacGroupPermissions(id: string, json: RbacAssignmentChanges) {
      return handleHonoClientResponse(
        await groups().v1.permissions.groups[':id'].permissions.$put({
          param: { id },
          json,
        }),
      );
    },

    /** Ficha de un permiso. Lanza `ApiError` 403/404. */
    async getRbacPermission(id: string) {
      return handleHonoClientResponse(
        await permissions().v1.permissions[':id'].$get({ param: { id } }),
      );
    },

    async createRbacPermission(json: RbacPermissionInput) {
      return handleHonoClientResponse(
        await permissions().v1.permissions.$post({ json }),
      );
    },

    async updateRbacPermission(id: string, json: RbacPermissionInput) {
      return handleHonoClientResponse(
        await permissions().v1.permissions[':id'].$patch({
          param: { id },
          json,
        }),
      );
    },

    async deleteRbacPermission(id: string) {
      return handleHonoClientResponse(
        await permissions().v1.permissions[':id'].$delete({ param: { id } }),
      );
    },
  };
}
