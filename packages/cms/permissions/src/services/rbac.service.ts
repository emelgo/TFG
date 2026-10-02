/**
 * Servicio de Ajustes > Permisos del CMS (F2.7b): roles, grupos de
 * permisos y permisos.
 *
 * Lista y muestra el RBAC propio del CMS y permite crear, editar y borrar
 * roles, grupos y permisos, y asignar grupos y permisos a los roles y
 * permisos a los grupos. Todo se ejecuta con el cliente Drizzle de la
 * petición (transacción con los *claims* del usuario), así que PostgreSQL
 * aplica las políticas RLS del esquema `cms`, las reglas de rango
 * (`can_action_role`, `can_delete_role`, `can_modify_permission*`,
 * `can_modify_role_permission_group`), la regla «solo se concede lo que uno
 * tiene» (`can_grant_permission`, `can_grant_permission_group`,
 * `enforce_permission_reshape_grantable`) y la guardia de los objetos de
 * sistema del super-admin (`guard_system_rbac_objects`).
 *
 * El servicio llama a esas mismas funciones ANTES de escribir para
 * responder con el motivo exacto (`PERMISSION_*`, `ROLE_*`, `GROUP_*`) y
 * para decirle a la interfaz qué puede ofrecer (`access` de cada ficha); la
 * base de datos sigue siendo la autoridad y, si rechaza algo que aquí no se
 * previó (una carrera con otro operador), su error se traduce con
 * `fromRbacDbError`. Nunca se usa el cliente administrador: nada de este
 * servicio se salta RLS.
 *
 * Reglas que añade la API por encima de la base de datos:
 *  - leer exige `role:select` (roles) o `permission:select` (grupos y
 *    permisos): el resto del personal no ve la pestaña;
 *  - no se crea un permiso cuya capacidad no se tiene (la BD lo permitiría,
 *    pero nadie podría asignarlo sin tenerla);
 *  - no se borra un rol con miembros (la BD les quitaría el rol en
 *    cascada sin avisar).
 *
 * Todo valor del usuario entra en SQL como parámetro enlazado.
 *
 * [TFG] RF-09 · RNF-02 · ADR-014 · ADR-015.
 */
import { type SQL, and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Context } from 'hono';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import { isAssignableRank } from '@pymekit/cms-shared/rbac';
import type { DrizzleSupabaseClient } from '@pymekit/cms-supabase/client';
import {
  permissionGroupPermissionsInCms,
  permissionGroupsInCms,
  permissionsInCms,
  rolePermissionGroupsInCms,
  rolePermissionsInCms,
  rolesInCms,
} from '@pymekit/cms-supabase/schema';

import {
  RbacError,
  type RbacErrorSubject,
  fromRbacDbError,
  getPostgresErrorCode,
} from '../lib/rbac-errors';
import {
  type PermissionInput,
  type PermissionRow,
  toPermissionRow,
} from '../lib/rbac-schemas';

/** Transacción de Drizzle con los *claims* del usuario. */
type Tx = Parameters<Parameters<DrizzleSupabaseClient['runTransaction']>[0]>[0];

/** Cambios de asignación ya validados por la ruta. */
export type AssignmentChanges = { toAdd: string[]; toRemove: string[] };

/** Crea el servicio del RBAC para la petición actual. */
export function createRbacService(c: Context) {
  return new RbacService(c);
}

class RbacService {
  constructor(private readonly context: Context) {}

  /**
   * Ejecuta `fn` en una transacción con los *claims* del usuario y traduce
   * los rechazos de la base de datos a `RbacError`.
   */
  private async run<T>(subject: RbacErrorSubject, fn: (tx: Tx) => Promise<T>) {
    const client = this.context.get('drizzle');

    try {
      return await client.runTransaction(fn);
    } catch (error) {
      throw fromRbacDbError(error, subject) ?? error;
    }
  }

  // ---------------------------------------------------------------------------
  // Resumen y catálogo
  // ---------------------------------------------------------------------------

  /**
   * Devuelve los roles (con `role:select`), los grupos y los permisos (con
   * `permission:select`) visibles para el usuario, y lo que puede crear.
   *
   * @throws `PERMISSION_ACCESS_DENIED` sin ninguno de los dos permisos.
   */
  async getOverview() {
    return this.run('permission', async (tx) => {
      const actor = await readActor(tx);

      if (!actor.canReadRoles && !actor.canReadPermissions) {
        throw accessDenied('overview');
      }

      const roles = actor.canReadRoles ? await listRoles(tx) : [];
      const groups = actor.canReadPermissions ? await listGroups(tx) : [];
      const permissions = actor.canReadPermissions
        ? await listPermissions(tx)
        : [];

      return {
        roles,
        groups,
        permissions,
        access: {
          canReadRoles: actor.canReadRoles,
          canReadPermissions: actor.canReadPermissions,
          canCreateRole: actor.roleInsert && (actor.maxRank ?? 0) > 0,
          canCreateGroup: actor.permissionInsert,
          canCreatePermission: actor.permissionInsert,
          maxRank: actor.maxRank,
        },
      };
    });
  }

  /**
   * Tablas gestionadas que el usuario puede leer, con sus columnas, para los
   * selectores del formulario de permisos. La política de
   * `cms.table_metadata` ya filtra por `has_data_permission(select)`: solo
   * se ofrecen tablas sobre las que el usuario tiene alguna capacidad.
   */
  async getCatalog() {
    return this.run('permission', async (tx) => {
      const actor = await readActor(tx);

      if (!actor.permissionInsert && !actor.permissionUpdate) {
        throw accessDenied('catalog');
      }

      const rows = await tx.execute<{
        schema_name: string;
        table_name: string;
        display_name: string | null;
        columns_config: Record<string, unknown> | null;
      }>(sql`
        select schema_name, table_name, display_name, columns_config
        from cms.table_metadata
        order by schema_name, table_name
      `);

      return {
        tables: rows.map((row) => ({
          schemaName: row.schema_name,
          tableName: row.table_name,
          displayName: row.display_name,
          columns: Object.keys(row.columns_config ?? {}).sort(),
        })),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Roles
  // ---------------------------------------------------------------------------

  /**
   * Crea un rol de rango ESTRICTAMENTE inferior al propio.
   *
   * @throws `PERMISSION_ACCESS_DENIED` sin `role:insert`,
   *   `ROLE_RANK_DENIED` si el rango no es inferior al propio y
   *   `ROLE_NAME_TAKEN`/`ROLE_RANK_TAKEN` si ya existen.
   */
  async createRole(input: {
    name: string;
    description: string | null;
    rank: number;
  }) {
    return this.run('role', async (tx) => {
      const actor = await readActor(tx);

      if (!actor.roleInsert) {
        throw accessDenied('role:insert');
      }

      if (!isAssignableRank(input.rank, actor.maxRank)) {
        throw new RbacError(
          CMS_API_ERROR_CODES.ROLE_RANK_DENIED,
          `Rank ${input.rank} is not below ${actor.maxRank ?? 'none'}`,
        );
      }

      await assertRoleUnique(tx, { name: input.name, rank: input.rank });

      const [created] = await tx
        .insert(rolesInCms)
        .values({
          name: input.name,
          description: input.description,
          rank: input.rank,
        })
        .returning({ id: rolesInCms.id });

      if (!created) {
        throw accessDenied('role insert returned nothing');
      }

      return created;
    });
  }

  /**
   * Ficha de un rol: sus grupos, sus permisos directos, sus miembros, lo
   * que el usuario puede hacer con él y lo que podría asignarle.
   *
   * @throws `PERMISSION_ACCESS_DENIED` sin `role:select` y
   *   `ROLE_NOT_FOUND` si no existe.
   */
  async getRole(id: string) {
    return this.run('role', async (tx) => {
      const actor = await readActor(tx);

      if (!actor.canReadRoles) {
        throw accessDenied('role:select');
      }

      const role = await findRole(tx, id);

      const groups = await tx
        .select({
          id: permissionGroupsInCms.id,
          name: permissionGroupsInCms.name,
          description: permissionGroupsInCms.description,
          isSystem: sql<boolean>`coalesce(${permissionGroupsInCms.metadata} ? 'system_group', false)`,
        })
        .from(rolePermissionGroupsInCms)
        .innerJoin(
          permissionGroupsInCms,
          eq(permissionGroupsInCms.id, rolePermissionGroupsInCms.groupId),
        )
        .where(eq(rolePermissionGroupsInCms.roleId, id))
        .orderBy(permissionGroupsInCms.name);

      const permissions = await listPermissions(
        tx,
        sql`exists (select 1 from cms.role_permissions rp
                    where rp.permission_id = p.id and rp.role_id = ${id})`,
      );

      // Quién tiene el rol solo se muestra a quien ya puede consultar las
      // cuentas (`account:select`, como Ajustes > Miembros); al resto le
      // basta el número (`role.memberCount`).
      const members = !actor.canReadAccounts
        ? []
        : await tx.execute<{
            id: string;
            display_name: string | null;
            is_active: boolean;
          }>(sql`
        select a.id,
               coalesce(nullif(a.metadata ->> 'display_name', ''), nullif(a.metadata ->> 'username', '')) as display_name,
               a.is_active
        from cms.account_roles ar
                 join cms.accounts a on a.id = ar.account_id
        where ar.role_id = ${id}
        order by display_name nulls last, a.id
      `);

      const [flags] = await tx.execute<{
        can_update: boolean | null;
        can_delete: boolean | null;
        can_add_groups: boolean | null;
        can_remove_groups: boolean | null;
        can_add_permissions: boolean | null;
        can_remove_permissions: boolean | null;
      }>(sql`
        select cms.can_action_role(${id}::uuid, 'update') as can_update,
               cms.can_delete_role(${id}::uuid) as can_delete,
               cms.can_modify_role_permission_group(cms.get_current_user_account_id(), ${id}::uuid, 'insert') as can_add_groups,
               cms.can_modify_role_permission_group(cms.get_current_user_account_id(), ${id}::uuid, 'delete') as can_remove_groups,
               (cms.can_action_role(${id}::uuid, 'insert')
                   and cms.has_admin_permission('permission', 'insert')) as can_add_permissions,
               (cms.can_action_role(${id}::uuid, 'delete')
                   and cms.has_admin_permission('permission', 'delete')) as can_remove_permissions
      `);

      const editable = !role.isSystem;
      const access = {
        canUpdate: editable && flags?.can_update === true,
        canDelete:
          editable && flags?.can_delete === true && role.memberCount === 0,
        canAddGroups: editable && flags?.can_add_groups === true,
        canRemoveGroups: editable && flags?.can_remove_groups === true,
        canAddPermissions: editable && flags?.can_add_permissions === true,
        canRemovePermissions:
          editable && flags?.can_remove_permissions === true,
        maxRank: actor.maxRank,
        ...viewerAccess(actor),
      };

      const assignableGroups = access.canAddGroups
        ? await tx.execute<{
            id: string;
            name: string;
            description: string | null;
          }>(sql`
            select g.id, g.name, g.description
            from cms.permission_groups g
            where not coalesce(g.metadata ? 'system_group', false)
              and not exists (select 1 from cms.role_permission_groups rpg
                              where rpg.role_id = ${id} and rpg.group_id = g.id)
              and cms.can_grant_permission_group(g.id)
            order by g.name
          `)
        : [];

      const assignablePermissions = access.canAddPermissions
        ? await listPermissions(
            tx,
            sql`not exists (select 1 from cms.role_permissions rp
                            where rp.permission_id = p.id and rp.role_id = ${id})
                and cms.can_grant_permission(p.id)`,
          )
        : [];

      // Rangos ocupados (el rango es único), para el selector al editar.
      const ranks = await tx
        .select({ rank: rolesInCms.rank })
        .from(rolesInCms)
        .where(ne(rolesInCms.id, id));

      return {
        role,
        groups,
        permissions,
        takenRanks: ranks.map((row) => row.rank),
        members: members.map((member) => ({
          id: member.id,
          displayName: member.display_name,
          isActive: member.is_active,
        })),
        access,
        assignableGroups: [...assignableGroups],
        assignablePermissions,
      };
    });
  }

  /**
   * Edita el nombre, la descripción o el rango de un rol de rango inferior
   * al propio. El rango nuevo también debe ser inferior al propio.
   */
  async updateRole(
    id: string,
    input: { name?: string; description?: string | null; rank?: number },
  ) {
    return this.run('role', async (tx) => {
      const actor = await readActor(tx);
      const role = await findRole(tx, id);

      assertNotSystem(role.isSystem, 'role');

      if (!actor.roleUpdate) {
        throw accessDenied('role:update');
      }

      if (
        !(await checkBoolean(
          tx,
          sql`cms.can_action_role(${id}::uuid, 'update')`,
        ))
      ) {
        throw new RbacError(
          CMS_API_ERROR_CODES.ROLE_RANK_DENIED,
          'Role is not below the actor rank',
        );
      }

      if (
        input.rank !== undefined &&
        !isAssignableRank(input.rank, actor.maxRank)
      ) {
        throw new RbacError(
          CMS_API_ERROR_CODES.ROLE_RANK_DENIED,
          `Rank ${input.rank} is not below ${actor.maxRank ?? 'none'}`,
        );
      }

      await assertRoleUnique(tx, { name: input.name, rank: input.rank }, id);

      const updated = await tx
        .update(rolesInCms)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.rank !== undefined ? { rank: input.rank } : {}),
        })
        .where(eq(rolesInCms.id, id))
        .returning({ id: rolesInCms.id });

      if (updated.length === 0) {
        throw accessDenied('role update filtered by RLS');
      }

      return { id };
    });
  }

  /**
   * Borra un rol de rango inferior al propio que no tenga miembros.
   *
   * @throws `ROLE_HAS_MEMBERS` si alguna cuenta lo tiene (incluida la
   *   propia): hay que reasignarlas antes desde Ajustes > Miembros.
   */
  async deleteRole(id: string) {
    return this.run('role', async (tx) => {
      const actor = await readActor(tx);
      const role = await findRole(tx, id);

      assertNotSystem(role.isSystem, 'role');

      if (!actor.roleDelete) {
        throw accessDenied('role:delete');
      }

      if (role.memberCount > 0) {
        throw new RbacError(
          CMS_API_ERROR_CODES.ROLE_HAS_MEMBERS,
          'Role still has members',
        );
      }

      if (!(await checkBoolean(tx, sql`cms.can_delete_role(${id}::uuid)`))) {
        throw new RbacError(
          CMS_API_ERROR_CODES.ROLE_RANK_DENIED,
          'Role is not below the actor rank',
        );
      }

      const deleted = await tx
        .delete(rolesInCms)
        .where(eq(rolesInCms.id, id))
        .returning({ id: rolesInCms.id });

      if (deleted.length === 0) {
        throw accessDenied('role delete filtered by RLS');
      }

      return { id };
    });
  }

  /**
   * Asigna y quita grupos de permisos a un rol en una sola transacción.
   * Solo en roles de rango inferior al propio (nunca el propio) y solo
   * grupos cuyos permisos puede conceder el usuario.
   */
  async updateRoleGroups(id: string, changes: AssignmentChanges) {
    return this.run('role', async (tx) => {
      const actor = await readActor(tx);
      const role = await findRole(tx, id);

      assertNotSystem(role.isSystem, 'role');

      for (const [list, action, allowed] of [
        [changes.toAdd, 'insert', actor.roleInsert],
        [changes.toRemove, 'delete', actor.roleDelete],
      ] as const) {
        if (list.length === 0) {
          continue;
        }

        if (!allowed) {
          throw accessDenied(`role:${action}`);
        }

        const canModify = await checkBoolean(
          tx,
          sql`cms.can_modify_role_permission_group(cms.get_current_user_account_id(), ${id}::uuid, ${action}::cms.system_action)`,
        );

        if (!canModify) {
          throw new RbacError(
            CMS_API_ERROR_CODES.ROLE_RANK_DENIED,
            'Role is not below the actor rank',
          );
        }
      }

      if (changes.toAdd.length > 0) {
        const groups = await tx
          .select({
            id: permissionGroupsInCms.id,
            isSystem: sql<boolean>`coalesce(${permissionGroupsInCms.metadata} ? 'system_group', false)`,
            grantable: sql<boolean>`cms.can_grant_permission_group(${permissionGroupsInCms.id})`,
          })
          .from(permissionGroupsInCms)
          .where(inArray(permissionGroupsInCms.id, changes.toAdd));

        assertAllFound(groups, changes.toAdd, 'group');

        if (groups.some((group) => group.isSystem)) {
          throw new RbacError(
            CMS_API_ERROR_CODES.GROUP_SYSTEM_PROTECTED,
            'The system group cannot be attached to other roles',
          );
        }

        if (groups.some((group) => group.grantable !== true)) {
          throw new RbacError(
            CMS_API_ERROR_CODES.PERMISSION_NOT_GRANTABLE,
            'Group grants capabilities the actor does not hold',
          );
        }

        await tx
          .insert(rolePermissionGroupsInCms)
          .values(changes.toAdd.map((groupId) => ({ roleId: id, groupId })))
          .onConflictDoNothing();
      }

      if (changes.toRemove.length > 0) {
        await tx
          .delete(rolePermissionGroupsInCms)
          .where(
            and(
              eq(rolePermissionGroupsInCms.roleId, id),
              inArray(rolePermissionGroupsInCms.groupId, changes.toRemove),
            ),
          );
      }

      return { id };
    });
  }

  /**
   * Asigna y quita permisos directos a un rol en una sola transacción, con
   * las mismas reglas que la política de `cms.role_permissions`: permiso
   * `role` y `permission` para la acción, rango superior al del rol y, al
   * añadir, capacidad que el usuario ya tiene.
   */
  async updateRolePermissions(id: string, changes: AssignmentChanges) {
    return this.run('role', async (tx) => {
      const actor = await readActor(tx);
      const role = await findRole(tx, id);

      assertNotSystem(role.isSystem, 'role');

      for (const [list, action, allowed] of [
        [changes.toAdd, 'insert', actor.roleInsert && actor.permissionInsert],
        [
          changes.toRemove,
          'delete',
          actor.roleDelete && actor.permissionDelete,
        ],
      ] as const) {
        if (list.length === 0) {
          continue;
        }

        if (!allowed) {
          throw accessDenied(`role/permission:${action}`);
        }

        const canModify = await checkBoolean(
          tx,
          sql`cms.can_action_role(${id}::uuid, ${action}::cms.system_action)`,
        );

        if (!canModify) {
          throw new RbacError(
            CMS_API_ERROR_CODES.ROLE_RANK_DENIED,
            'Role is not below the actor rank',
          );
        }
      }

      if (changes.toAdd.length > 0) {
        await assertPermissionsGrantable(tx, changes.toAdd);

        await tx
          .insert(rolePermissionsInCms)
          .values(
            changes.toAdd.map((permissionId) => ({ roleId: id, permissionId })),
          )
          .onConflictDoNothing();
      }

      if (changes.toRemove.length > 0) {
        await tx
          .delete(rolePermissionsInCms)
          .where(
            and(
              eq(rolePermissionsInCms.roleId, id),
              inArray(rolePermissionsInCms.permissionId, changes.toRemove),
            ),
          );
      }

      return { id };
    });
  }

  // ---------------------------------------------------------------------------
  // Grupos de permisos
  // ---------------------------------------------------------------------------

  /** Crea un grupo de permisos vacío (su creador queda en `created_by`). */
  async createGroup(input: { name: string; description: string | null }) {
    return this.run('group', async (tx) => {
      const actor = await readActor(tx);

      if (!actor.permissionInsert) {
        throw accessDenied('permission:insert');
      }

      await assertNameFree(tx, 'group', input.name);

      // Sin `RETURNING`: la política SELECT del grupo
      // (`can_view_permission_group`, «lo creó él») consulta la tabla y no
      // ve todavía la fila que se está insertando, así que PostgreSQL
      // rechazaría el `RETURNING` con 42501. El id se genera aquí.
      const id = crypto.randomUUID();

      await tx
        .insert(permissionGroupsInCms)
        .values({ id, name: input.name, description: input.description });

      return { id };
    });
  }

  /**
   * Ficha de un grupo: sus permisos, los roles que lo usan (los que el
   * usuario puede ver), lo que puede hacer con él y los permisos que podría
   * añadirle.
   */
  async getGroup(id: string) {
    return this.run('group', async (tx) => {
      const actor = await readActor(tx);

      if (!actor.canReadPermissions) {
        throw accessDenied('permission:select');
      }

      const group = await findGroup(tx, id);

      const permissions = await listPermissions(
        tx,
        sql`exists (select 1 from cms.permission_group_permissions pgp
                    where pgp.permission_id = p.id and pgp.group_id = ${id})`,
      );

      const roles = await tx
        .select({
          id: rolesInCms.id,
          name: rolesInCms.name,
          rank: rolesInCms.rank,
        })
        .from(rolePermissionGroupsInCms)
        .innerJoin(
          rolesInCms,
          eq(rolesInCms.id, rolePermissionGroupsInCms.roleId),
        )
        .where(eq(rolePermissionGroupsInCms.groupId, id))
        .orderBy(sql`${rolesInCms.rank} desc`);

      const editable = !group.isSystem;

      // `can_modify_permission_group*` lanzan una excepción (en lugar de
      // devolver `false`) en algunos rechazos: se evalúan en un punto de
      // guardado para no abortar la transacción.
      const access = {
        canUpdate:
          editable &&
          (await checkBoolean(
            tx,
            sql`cms.can_modify_permission_group(${id}::uuid, 'update')`,
          )),
        canDelete:
          editable &&
          (await checkBoolean(
            tx,
            sql`cms.can_modify_permission_group(${id}::uuid, 'delete')`,
          )),
        canAddPermissions:
          editable &&
          actor.permissionInsert &&
          (await checkBoolean(
            tx,
            sql`cms.can_modify_permission_group_permissions(${id}::uuid, 'insert')`,
          )),
        canRemovePermissions:
          editable &&
          actor.permissionDelete &&
          (await checkBoolean(
            tx,
            sql`cms.can_modify_permission_group_permissions(${id}::uuid, 'delete')`,
          )),
        ...viewerAccess(actor),
      };

      const assignablePermissions = access.canAddPermissions
        ? await listPermissions(
            tx,
            sql`not exists (select 1 from cms.permission_group_permissions pgp
                            where pgp.permission_id = p.id and pgp.group_id = ${id})
                and cms.can_grant_permission(p.id)`,
          )
        : [];

      return { group, permissions, roles, access, assignablePermissions };
    });
  }

  /** Edita el nombre o la descripción de un grupo. */
  async updateGroup(
    id: string,
    input: { name?: string; description?: string | null },
  ) {
    return this.run('group', async (tx) => {
      const actor = await readActor(tx);
      const group = await findGroup(tx, id);

      assertNotSystem(group.isSystem, 'group');

      if (!actor.permissionUpdate) {
        throw accessDenied('permission:update');
      }

      if (
        !(await checkBoolean(
          tx,
          sql`cms.can_modify_permission_group(${id}::uuid, 'update')`,
        ))
      ) {
        throw groupRankDenied();
      }

      if (input.name !== undefined) {
        await assertNameFree(tx, 'group', input.name, id);
      }

      const updated = await tx
        .update(permissionGroupsInCms)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
        })
        .where(eq(permissionGroupsInCms.id, id))
        .returning({ id: permissionGroupsInCms.id });

      if (updated.length === 0) {
        throw accessDenied('group update filtered by RLS');
      }

      return { id };
    });
  }

  /**
   * Borra un grupo. La base de datos exige un rango ESTRICTAMENTE superior
   * al de todos los roles que lo usan y que no lo tenga el rol propio (si
   * no lo usa nadie, solo su creador).
   */
  async deleteGroup(id: string) {
    return this.run('group', async (tx) => {
      const actor = await readActor(tx);
      const group = await findGroup(tx, id);

      assertNotSystem(group.isSystem, 'group');

      if (!actor.permissionDelete) {
        throw accessDenied('permission:delete');
      }

      if (
        !(await checkBoolean(
          tx,
          sql`cms.can_modify_permission_group(${id}::uuid, 'delete')`,
        ))
      ) {
        throw groupRankDenied();
      }

      const deleted = await tx
        .delete(permissionGroupsInCms)
        .where(eq(permissionGroupsInCms.id, id))
        .returning({ id: permissionGroupsInCms.id });

      if (deleted.length === 0) {
        throw accessDenied('group delete filtered by RLS');
      }

      return { id };
    });
  }

  /** Añade y quita permisos de un grupo en una sola transacción. */
  async updateGroupPermissions(id: string, changes: AssignmentChanges) {
    return this.run('group', async (tx) => {
      const actor = await readActor(tx);
      const group = await findGroup(tx, id);

      assertNotSystem(group.isSystem, 'group');

      for (const [list, action, allowed] of [
        [changes.toAdd, 'insert', actor.permissionInsert],
        [changes.toRemove, 'delete', actor.permissionDelete],
      ] as const) {
        if (list.length === 0) {
          continue;
        }

        if (!allowed) {
          throw accessDenied(`permission:${action}`);
        }

        const canModify = await checkBoolean(
          tx,
          sql`cms.can_modify_permission_group_permissions(${id}::uuid, ${action}::cms.system_action)`,
        );

        if (!canModify) {
          throw groupRankDenied();
        }
      }

      if (changes.toAdd.length > 0) {
        await assertPermissionsGrantable(tx, changes.toAdd);

        await tx
          .insert(permissionGroupPermissionsInCms)
          .values(
            changes.toAdd.map((permissionId) => ({
              groupId: id,
              permissionId,
            })),
          )
          .onConflictDoNothing();
      }

      if (changes.toRemove.length > 0) {
        await tx
          .delete(permissionGroupPermissionsInCms)
          .where(
            and(
              eq(permissionGroupPermissionsInCms.groupId, id),
              inArray(
                permissionGroupPermissionsInCms.permissionId,
                changes.toRemove,
              ),
            ),
          );
      }

      return { id };
    });
  }

  // ---------------------------------------------------------------------------
  // Permisos
  // ---------------------------------------------------------------------------

  /**
   * Crea un permiso cuya capacidad ya tiene el usuario.
   *
   * @throws `PERMISSION_NOT_GRANTABLE` si pide más de lo que tiene.
   */
  async createPermission(input: PermissionInput) {
    return this.run('permission', async (tx) => {
      const actor = await readActor(tx);

      if (!actor.permissionInsert) {
        throw accessDenied('permission:insert');
      }

      const row = toPermissionRow(input);

      await assertCapabilityHeld(tx, row);
      await assertNameFree(tx, 'permission', row.name);

      const [created] = await tx
        .insert(permissionsInCms)
        .values(row)
        .returning({ id: permissionsInCms.id });

      if (!created) {
        throw accessDenied('permission insert returned nothing');
      }

      return created;
    });
  }

  /** Ficha de un permiso: los roles y grupos que lo tienen y el acceso. */
  async getPermission(id: string) {
    return this.run('permission', async (tx) => {
      const actor = await readActor(tx);

      if (!actor.canReadPermissions) {
        throw accessDenied('permission:select');
      }

      const [permission] = await listPermissions(tx, sql`p.id = ${id}`);

      if (!permission) {
        throw new RbacError(
          CMS_API_ERROR_CODES.PERMISSION_NOT_FOUND,
          'Permission not found',
        );
      }

      const roles = await tx
        .select({
          id: rolesInCms.id,
          name: rolesInCms.name,
          rank: rolesInCms.rank,
        })
        .from(rolePermissionsInCms)
        .innerJoin(rolesInCms, eq(rolesInCms.id, rolePermissionsInCms.roleId))
        .where(eq(rolePermissionsInCms.permissionId, id))
        .orderBy(sql`${rolesInCms.rank} desc`);

      const groups = await tx
        .select({
          id: permissionGroupsInCms.id,
          name: permissionGroupsInCms.name,
        })
        .from(permissionGroupPermissionsInCms)
        .innerJoin(
          permissionGroupsInCms,
          eq(permissionGroupsInCms.id, permissionGroupPermissionsInCms.groupId),
        )
        .where(eq(permissionGroupPermissionsInCms.permissionId, id))
        .orderBy(permissionGroupsInCms.name);

      const editable = !permission.isSystem;
      const canUpdate =
        editable &&
        actor.permissionUpdate &&
        (await checkBoolean(
          tx,
          sql`cms.can_modify_permission(${id}::uuid, 'update')`,
        ));
      const canDelete =
        editable &&
        actor.permissionDelete &&
        (await checkBoolean(tx, sql`cms.can_delete_permission(${id}::uuid)`));

      return {
        permission,
        roles,
        groups,
        access: { canUpdate, canDelete, ...viewerAccess(actor) },
      };
    });
  }

  /**
   * Sustituye la definición de un permiso. Si cambia la capacidad (tipo,
   * recurso, acción, ámbito, tabla, *bucket*…), la nueva debe tenerla el
   * usuario; lo vuelve a exigir el *trigger*
   * `enforce_permission_reshape_grantable`.
   */
  async updatePermission(id: string, input: PermissionInput) {
    return this.run('permission', async (tx) => {
      const actor = await readActor(tx);
      const [current] = await listPermissions(tx, sql`p.id = ${id}`);

      if (!current) {
        throw new RbacError(
          CMS_API_ERROR_CODES.PERMISSION_NOT_FOUND,
          'Permission not found',
        );
      }

      assertNotSystem(current.isSystem, 'permission');

      if (!actor.permissionUpdate) {
        throw accessDenied('permission:update');
      }

      if (
        !(await checkBoolean(
          tx,
          sql`cms.can_modify_permission(${id}::uuid, 'update')`,
        ))
      ) {
        throw new RbacError(
          CMS_API_ERROR_CODES.PERMISSION_RANK_DENIED,
          'Permission is used by a role at or above the actor rank',
        );
      }

      const row = toPermissionRow(input);

      if (capabilityChanged(current, row)) {
        await assertCapabilityHeld(tx, row);
      }

      if (row.name !== current.name) {
        await assertNameFree(tx, 'permission', row.name, id);
      }

      const updated = await tx
        .update(permissionsInCms)
        .set(row)
        .where(eq(permissionsInCms.id, id))
        .returning({ id: permissionsInCms.id });

      if (updated.length === 0) {
        throw accessDenied('permission update filtered by RLS');
      }

      return { id };
    });
  }

  /**
   * Borra un permiso que ya no está asignado a ningún rol, grupo ni cuenta.
   *
   * @throws `PERMISSION_IN_USE` si sigue asignado.
   */
  async deletePermission(id: string) {
    return this.run('permission', async (tx) => {
      const actor = await readActor(tx);
      const [current] = await listPermissions(tx, sql`p.id = ${id}`);

      if (!current) {
        throw new RbacError(
          CMS_API_ERROR_CODES.PERMISSION_NOT_FOUND,
          'Permission not found',
        );
      }

      assertNotSystem(current.isSystem, 'permission');

      if (!actor.permissionDelete) {
        throw accessDenied('permission:delete');
      }

      if (
        !(await checkBoolean(
          tx,
          sql`cms.can_modify_permission(${id}::uuid, 'delete')`,
        ))
      ) {
        throw new RbacError(
          CMS_API_ERROR_CODES.PERMISSION_RANK_DENIED,
          'Permission is used by a role at or above the actor rank',
        );
      }

      if (
        !(await checkBoolean(tx, sql`cms.can_delete_permission(${id}::uuid)`))
      ) {
        throw new RbacError(
          CMS_API_ERROR_CODES.PERMISSION_IN_USE,
          'Permission is still assigned',
        );
      }

      const deleted = await tx
        .delete(permissionsInCms)
        .where(eq(permissionsInCms.id, id))
        .returning({ id: permissionsInCms.id });

      if (deleted.length === 0) {
        throw accessDenied('permission delete filtered by RLS');
      }

      return { id };
    });
  }
}

// -----------------------------------------------------------------------------
// Consultas auxiliares (todas con parámetros enlazados)
// -----------------------------------------------------------------------------

/**
 * Lee de una vez quién actúa: su rango máximo y sus permisos de sistema
 * sobre `role` y `permission`. `has_admin_permission` ya incluye
 * `verify_admin_access` (cuenta activa y MFA).
 */
async function readActor(tx: Tx) {
  const [row] = await tx.execute<{
    max_rank: number | null;
    role_select: boolean | null;
    role_insert: boolean | null;
    role_update: boolean | null;
    role_delete: boolean | null;
    permission_select: boolean | null;
    permission_insert: boolean | null;
    permission_update: boolean | null;
    permission_delete: boolean | null;
    account_select: boolean | null;
  }>(sql`
    select cms.get_user_max_role_rank(cms.get_current_user_account_id()) as max_rank,
           cms.has_admin_permission('role', 'select') as role_select,
           cms.has_admin_permission('role', 'insert') as role_insert,
           cms.has_admin_permission('role', 'update') as role_update,
           cms.has_admin_permission('role', 'delete') as role_delete,
           cms.has_admin_permission('permission', 'select') as permission_select,
           cms.has_admin_permission('permission', 'insert') as permission_insert,
           cms.has_admin_permission('permission', 'update') as permission_update,
           cms.has_admin_permission('permission', 'delete') as permission_delete,
           cms.has_admin_permission('account', 'select') as account_select
  `);

  return {
    maxRank: row?.max_rank ?? null,
    canReadRoles: row?.role_select === true,
    canReadPermissions: row?.permission_select === true,
    canReadAccounts: row?.account_select === true,
    roleInsert: row?.role_insert === true,
    roleUpdate: row?.role_update === true,
    roleDelete: row?.role_delete === true,
    permissionInsert: row?.permission_insert === true,
    permissionUpdate: row?.permission_update === true,
    permissionDelete: row?.permission_delete === true,
  };
}

/**
 * Evalúa una expresión booleana en un punto de guardado (`savepoint`):
 * algunas funciones heredadas (`can_modify_permission_group*`) lanzan una
 * excepción (`RAISE EXCEPTION`, SQLSTATE `P0001`) en lugar de devolver
 * `false`, y sin el punto de guardado abortarían toda la transacción. Solo
 * ese rechazo cuenta como «no»; cualquier otro error (tiempo máximo,
 * conexión…) se relanza para no responder con un motivo falso.
 */
async function checkBoolean(tx: Tx, expression: SQL) {
  try {
    return await tx.transaction(async (savepoint) => {
      const [row] = await savepoint.execute<{ value: boolean | null }>(
        sql`select (${expression}) as value`,
      );

      return row?.value === true;
    });
  } catch (error) {
    if (getPostgresErrorCode(error) === 'P0001') {
      return false;
    }

    throw error;
  }
}

/**
 * Qué fichas puede abrir el usuario desde otra (los enlaces entre roles,
 * grupos y permisos solo se muestran si la ficha destino es legible) y si
 * ve los miembros de un rol.
 */
function viewerAccess(actor: Awaited<ReturnType<typeof readActor>>) {
  return {
    canReadRoles: actor.canReadRoles,
    canReadPermissions: actor.canReadPermissions,
    canReadMembers: actor.canReadAccounts,
  };
}

function accessDenied(detail: string) {
  return new RbacError(
    CMS_API_ERROR_CODES.PERMISSION_ACCESS_DENIED,
    `Access denied (${detail})`,
  );
}

function groupRankDenied() {
  return new RbacError(
    CMS_API_ERROR_CODES.GROUP_RANK_DENIED,
    'Group is used by a role the actor cannot manage',
  );
}

function assertNotSystem(isSystem: boolean, subject: RbacErrorSubject) {
  if (!isSystem) {
    return;
  }

  throw new RbacError(
    subject === 'role'
      ? CMS_API_ERROR_CODES.ROLE_SYSTEM_PROTECTED
      : subject === 'group'
        ? CMS_API_ERROR_CODES.GROUP_SYSTEM_PROTECTED
        : CMS_API_ERROR_CODES.PERMISSION_SYSTEM_PROTECTED,
    `System ${subject} is immutable from the CMS`,
  );
}

async function listRoles(tx: Tx) {
  const rows = await tx.execute<{
    id: string;
    name: string;
    description: string | null;
    rank: number;
    is_system: boolean;
    member_count: number;
  }>(sql`
    select r.id, r.name, r.description, r.rank,
           coalesce(r.metadata ? 'system_role', false) as is_system,
           cms.count_role_members(r.id) as member_count
    from cms.roles r
    order by r.rank desc
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    rank: row.rank,
    isSystem: row.is_system,
    memberCount: row.member_count,
  }));
}

async function findRole(tx: Tx, id: string) {
  const [row] = await tx.execute<{
    id: string;
    name: string;
    description: string | null;
    rank: number;
    is_system: boolean;
    member_count: number;
  }>(sql`
    select r.id, r.name, r.description, r.rank,
           coalesce(r.metadata ? 'system_role', false) as is_system,
           cms.count_role_members(r.id) as member_count
    from cms.roles r
    where r.id = ${id}
  `);

  if (!row) {
    throw new RbacError(CMS_API_ERROR_CODES.ROLE_NOT_FOUND, 'Role not found');
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    rank: row.rank,
    isSystem: row.is_system,
    memberCount: row.member_count,
  };
}

async function listGroups(tx: Tx) {
  const rows = await tx.execute<{
    id: string;
    name: string;
    description: string | null;
    is_system: boolean;
    permission_count: number;
  }>(sql`
    select g.id, g.name, g.description,
           coalesce(g.metadata ? 'system_group', false) as is_system,
           (select count(*)::int from cms.permission_group_permissions pgp
            where pgp.group_id = g.id) as permission_count
    from cms.permission_groups g
    order by g.name
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isSystem: row.is_system,
    permissionCount: row.permission_count,
  }));
}

async function findGroup(tx: Tx, id: string) {
  const [row] = await tx.execute<{
    id: string;
    name: string;
    description: string | null;
    is_system: boolean;
  }>(sql`
    select g.id, g.name, g.description,
           coalesce(g.metadata ? 'system_group', false) as is_system
    from cms.permission_groups g
    where g.id = ${id}
  `);

  if (!row) {
    throw new RbacError(
      CMS_API_ERROR_CODES.GROUP_NOT_FOUND,
      'Permission group not found',
    );
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isSystem: row.is_system,
  };
}

/**
 * Lista permisos (con un filtro opcional sobre el alias `p`) en la forma que
 * ve la interfaz. De `metadata` solo sale la capacidad de almacenamiento y
 * la marca de sistema, nunca el objeto completo.
 */
async function listPermissions(tx: Tx, where?: SQL) {
  const rows = await tx.execute<{
    id: string;
    name: string;
    description: string | null;
    permission_type: 'system' | 'data';
    system_resource: string | null;
    scope: 'table' | 'column' | 'storage' | null;
    schema_name: string | null;
    table_name: string | null;
    column_name: string | null;
    action: string;
    bucket_name: string | null;
    path_pattern: string | null;
    is_system: boolean;
  }>(sql`
    select p.id, p.name, p.description, p.permission_type, p.system_resource,
           p.scope, p.schema_name, p.table_name, p.column_name, p.action,
           p.metadata ->> 'bucket_name' as bucket_name,
           p.metadata ->> 'path_pattern' as path_pattern,
           coalesce(p.metadata ? 'system_permission', false) as is_system
    from cms.permissions p
    ${where ? sql`where ${where}` : sql``}
    order by p.name
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    permissionType: row.permission_type,
    systemResource: row.system_resource,
    scope: row.scope,
    schemaName: row.schema_name,
    tableName: row.table_name,
    columnName: row.column_name,
    action: row.action,
    bucketName: row.bucket_name,
    pathPattern: row.path_pattern,
    isSystem: row.is_system,
  }));
}

type PermissionView = Awaited<ReturnType<typeof listPermissions>>[number];

/**
 * Indica si la nueva definición cambia la capacidad del permiso (lo mismo
 * que compara el *trigger* de la base de datos).
 */
export function capabilityChanged(
  current: PermissionView,
  next: PermissionRow,
) {
  return (
    current.permissionType !== next.permissionType ||
    current.systemResource !== next.systemResource ||
    current.action !== next.action ||
    current.scope !== next.scope ||
    current.schemaName !== next.schemaName ||
    current.tableName !== next.tableName ||
    current.columnName !== next.columnName ||
    (current.bucketName ?? null) !== (next.metadata['bucket_name'] ?? null) ||
    (current.pathPattern ?? null) !== (next.metadata['path_pattern'] ?? null)
  );
}

/**
 * Exige que el usuario pueda conceder la capacidad que define `row`: la
 * misma regla que aplica `can_grant_permission` a un permiso guardado
 * (`cms.capability_is_grantable`). Tenerla no basta: ninguna denegación
 * explícita del usuario puede solaparse con ella (bitácora B-47), así que
 * quien tiene lectura de `*.*` con una tabla denegada no puede crear ni
 * ensanchar un permiso que la incluya.
 */
async function assertCapabilityHeld(tx: Tx, row: PermissionRow) {
  const metadata = JSON.stringify(row.metadata);

  const granted = await checkBoolean(
    tx,
    sql`cms.capability_is_grantable(
      ${row.permissionType}::cms.permission_type,
      ${row.systemResource}::cms.system_resource,
      ${row.action}::cms.system_action,
      ${row.scope}::cms.permission_scope,
      ${row.schemaName}::text,
      ${row.tableName}::text,
      ${row.columnName}::text,
      ${metadata}::jsonb
    )`,
  );

  if (!granted) {
    throw new RbacError(
      CMS_API_ERROR_CODES.PERMISSION_NOT_GRANTABLE,
      'Capability not held by the actor',
    );
  }
}

/**
 * Exige que todos los permisos existan (y sean visibles) y que el usuario
 * pueda concederlos (`can_grant_permission`).
 */
async function assertPermissionsGrantable(tx: Tx, ids: string[]) {
  const rows = await tx
    .select({
      id: permissionsInCms.id,
      grantable: sql<boolean>`cms.can_grant_permission(${permissionsInCms.id})`,
    })
    .from(permissionsInCms)
    .where(inArray(permissionsInCms.id, ids));

  assertAllFound(rows, ids, 'permission');

  if (rows.some((row) => row.grantable !== true)) {
    throw new RbacError(
      CMS_API_ERROR_CODES.PERMISSION_NOT_GRANTABLE,
      'Permission grants capabilities the actor does not hold',
    );
  }
}

function assertAllFound(
  rows: Array<{ id: string }>,
  ids: string[],
  subject: 'group' | 'permission',
) {
  const found = new Set(rows.map((row) => row.id));

  if (ids.every((id) => found.has(id))) {
    return;
  }

  throw new RbacError(
    subject === 'group'
      ? CMS_API_ERROR_CODES.GROUP_NOT_FOUND
      : CMS_API_ERROR_CODES.PERMISSION_NOT_FOUND,
    `Unknown ${subject} in assignment`,
  );
}

/**
 * Comprueba que el nombre y el rango de un rol estén libres (excluyendo el
 * propio rol al editar) para responder 409 con el motivo exacto; la unicidad
 * la garantizan igualmente las restricciones de la tabla.
 */
async function assertRoleUnique(
  tx: Tx,
  values: { name?: string; rank?: number },
  excludeId?: string,
) {
  const others = excludeId ? ne(rolesInCms.id, excludeId) : undefined;

  if (values.name !== undefined) {
    const [taken] = await tx
      .select({ id: rolesInCms.id })
      .from(rolesInCms)
      .where(and(eq(rolesInCms.name, values.name), others));

    if (taken) {
      throw new RbacError(CMS_API_ERROR_CODES.ROLE_NAME_TAKEN, 'Name taken');
    }
  }

  if (values.rank !== undefined) {
    const [taken] = await tx
      .select({ id: rolesInCms.id })
      .from(rolesInCms)
      .where(and(eq(rolesInCms.rank, values.rank), others));

    if (taken) {
      throw new RbacError(CMS_API_ERROR_CODES.ROLE_RANK_TAKEN, 'Rank taken');
    }
  }
}

/**
 * Comprueba que el nombre de un grupo o permiso esté libre. Si la fila que
 * lo ocupa no es visible (RLS), no se detecta aquí y la restricción de la
 * tabla responde igualmente con `*_NAME_TAKEN`.
 */
async function assertNameFree(
  tx: Tx,
  subject: 'group' | 'permission',
  name: string,
  excludeId?: string,
) {
  const table = subject === 'group' ? permissionGroupsInCms : permissionsInCms;
  const [taken] = await tx
    .select({ id: table.id })
    .from(table)
    .where(
      and(
        eq(table.name, name),
        excludeId ? ne(table.id, excludeId) : undefined,
      ),
    );

  if (taken) {
    throw new RbacError(
      subject === 'group'
        ? CMS_API_ERROR_CODES.GROUP_NAME_TAKEN
        : CMS_API_ERROR_CODES.PERMISSION_NAME_TAKEN,
      'Name taken',
    );
  }
}
