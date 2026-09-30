/**
 * Servicio de Ajustes > Miembros del CMS (F2.7a).
 *
 * Lista las cuentas del personal del CMS, devuelve la ficha de una con lo
 * que el usuario actual puede hacer con ella, cambia su rol y la activa o
 * desactiva. Todas las operaciones se ejecutan con el cliente Drizzle de la
 * petición (transacción con los *claims* del usuario), así que PostgreSQL
 * aplica las políticas RLS del esquema `cms` y las reglas de rango de
 * `can_modify_account_role`, `can_action_account` y `set_account_active`.
 *
 * El servicio comprueba lo mismo ANTES de escribir para responder con el
 * motivo exacto (`MEMBER_*`) en lugar de un error genérico; la base de datos
 * sigue siendo la autoridad:
 *
 *  - leer miembros exige `account:select` (la política de `cms.accounts`
 *    deja verlas a cualquier miembro del personal; la API es más estricta);
 *  - nadie cambia sus propios roles ni su estado;
 *  - las cuentas raíz (super-admins de la plataforma, ADR-014) no se tocan;
 *  - solo se asignan o quitan roles de rango inferior al propio, a cuentas
 *    de rango inferior.
 *
 * El correo de cada miembro sale de `auth.users` (el de verdad, no el que
 * pueda haber escrito alguien en `metadata`), con el cliente administrador,
 * solo tras comprobar `auth_user:select` (como el explorador de usuarios) y
 * solo para las cuentas de la página. La búsqueda por correo exige lo mismo.
 *
 * Todo valor del usuario entra en SQL como parámetro enlazado.
 *
 * [TFG] RF-09 · RNF-02 · ADR-014.
 */
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Context } from 'hono';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import {
  type DrizzleSupabaseClient,
  getDrizzleSupabaseAdminClient,
} from '@pymekit/cms-supabase/client';
import {
  accountRolesInCms,
  accountsInCms,
  rolesInCms,
} from '@pymekit/cms-supabase/schema';

import {
  SettingsError,
  fromMemberRolesDbError,
  fromSetAccountActiveCode,
} from '../utils/settings-errors';

/** Miembros por página del listado. */
export const MEMBERS_PAGE_SIZE = 10;

/** Crea el servicio de miembros para la petición actual. */
export function createMembersService(c: Context) {
  return new MembersService(c);
}

/** Transacción de Drizzle con los *claims* del usuario. */
type Tx = Parameters<Parameters<DrizzleSupabaseClient['runTransaction']>[0]>[0];

class MembersService {
  constructor(private readonly context: Context) {}

  /**
   * Devuelve una página de miembros (más recientes primero) con su rol, su
   * estado y si su cuenta es raíz. `search` busca en el nombre visible y, si
   * el lector puede ver correos, también en el correo.
   *
   * @throws `SettingsError` `MEMBER_PERMISSION_DENIED` sin `account:select`.
   */
  async getMembers(params: { page: number; search?: string }) {
    const client = this.context.get('drizzle');
    const search = params.search?.trim() ?? '';

    const result = await client.runTransaction(async (tx) => {
      const access = await readAccess(tx);

      if (!access.canReadMembers) {
        return { denied: true as const };
      }

      const pattern = search ? `%${escapeLike(search)}%` : null;

      // El correo vive en `auth.users`, que `authenticated` no puede leer:
      // se buscan antes los ids de usuario cuyo correo coincide, con el
      // cliente administrador y solo si el lector puede ver correos.
      const authUserIdsByEmail =
        pattern && access.canReadEmails
          ? await findAuthUserIdsByEmail(pattern)
          : [];

      const where = pattern
        ? sql`(
            coalesce(${accountsInCms.metadata} ->> 'display_name', '') ilike ${pattern}
            or coalesce(${accountsInCms.metadata} ->> 'username', '') ilike ${pattern}
            ${
              authUserIdsByEmail.length > 0
                ? sql`or ${inArray(accountsInCms.authUserId, authUserIdsByEmail)}`
                : sql``
            }
          )`
        : undefined;

      const [countRow] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(accountsInCms)
        .where(where);

      const rows = await tx
        .select({
          id: accountsInCms.id,
          authUserId: accountsInCms.authUserId,
          createdAt: accountsInCms.createdAt,
          isActive: accountsInCms.isActive,
          metadata: accountsInCms.metadata,
          roleId: rolesInCms.id,
          roleName: rolesInCms.name,
          roleRank: rolesInCms.rank,
          isProtected: sql<boolean>`cms.is_root_managed_account(${accountsInCms.id})`,
        })
        .from(accountsInCms)
        .leftJoin(
          accountRolesInCms,
          eq(accountRolesInCms.accountId, accountsInCms.id),
        )
        .leftJoin(rolesInCms, eq(rolesInCms.id, accountRolesInCms.roleId))
        .where(where)
        .orderBy(desc(accountsInCms.createdAt), asc(accountsInCms.id))
        .limit(MEMBERS_PAGE_SIZE)
        .offset((params.page - 1) * MEMBERS_PAGE_SIZE);

      return {
        denied: false as const,
        canReadEmails: access.canReadEmails,
        total: countRow?.total ?? 0,
        rows,
      };
    });

    if (result.denied) {
      throw new SettingsError(
        CMS_API_ERROR_CODES.MEMBER_PERMISSION_DENIED,
        'Missing account:select permission',
      );
    }

    const emails = result.canReadEmails
      ? await readEmails(result.rows.map((row) => row.authUserId))
      : new Map<string, string | null>();

    return {
      members: result.rows.map((row) => ({
        id: row.id,
        authUserId: row.authUserId,
        createdAt: row.createdAt,
        isActive: row.isActive,
        isProtected: row.isProtected === true,
        displayName: getDisplayName(row.metadata),
        email: emails.get(row.authUserId) ?? null,
        role: row.roleId
          ? { id: row.roleId, name: row.roleName ?? '', rank: row.roleRank }
          : null,
      })),
      page: params.page,
      pageSize: MEMBERS_PAGE_SIZE,
      pageCount: Math.ceil(result.total / MEMBERS_PAGE_SIZE),
      total: result.total,
    };
  }

  /**
   * Devuelve la ficha de un miembro: cuenta, rol, correo, qué puede hacer el
   * usuario actual con ella (`access`) y los roles que podría asignarle
   * (rango inferior al suyo).
   *
   * @throws `SettingsError` `MEMBER_PERMISSION_DENIED` sin `account:select`
   *   y `MEMBER_NOT_FOUND` si la cuenta no existe.
   */
  async getMemberDetails(id: string) {
    const client = this.context.get('drizzle');

    const result = await client.runTransaction(async (tx) => {
      const access = await readAccess(tx);

      if (!access.canReadMembers) {
        return { status: 'denied' as const };
      }

      const [member] = await tx
        .select({
          id: accountsInCms.id,
          authUserId: accountsInCms.authUserId,
          createdAt: accountsInCms.createdAt,
          updatedAt: accountsInCms.updatedAt,
          isActive: accountsInCms.isActive,
          metadata: accountsInCms.metadata,
          roleId: rolesInCms.id,
          roleName: rolesInCms.name,
          roleDescription: rolesInCms.description,
          roleRank: rolesInCms.rank,
          assignedAt: accountRolesInCms.assignedAt,
        })
        .from(accountsInCms)
        .leftJoin(
          accountRolesInCms,
          eq(accountRolesInCms.accountId, accountsInCms.id),
        )
        .leftJoin(rolesInCms, eq(rolesInCms.id, accountRolesInCms.roleId))
        .where(eq(accountsInCms.id, id))
        .limit(1);

      if (!member) {
        return { status: 'not_found' as const };
      }

      const target = await readTargetAccess(tx, id);

      // Roles asignables: estrictamente por debajo del rango propio, la
      // misma regla que `can_modify_account_role` (RULE 1).
      const assignableRoles =
        target.actorRank === null
          ? []
          : await tx
              .select({
                id: rolesInCms.id,
                name: rolesInCms.name,
                description: rolesInCms.description,
                rank: rolesInCms.rank,
              })
              .from(rolesInCms)
              .where(sql`${rolesInCms.rank} < ${target.actorRank}`)
              .orderBy(desc(rolesInCms.rank));

      return {
        status: 'ok' as const,
        access,
        canReadEmails: access.canReadEmails,
        member,
        target,
        assignableRoles,
      };
    });

    if (result.status === 'denied') {
      throw new SettingsError(
        CMS_API_ERROR_CODES.MEMBER_PERMISSION_DENIED,
        'Missing account:select permission',
      );
    }

    if (result.status === 'not_found') {
      throw new SettingsError(
        CMS_API_ERROR_CODES.MEMBER_NOT_FOUND,
        `Member ${id} not found`,
      );
    }

    const { member, target } = result;

    const emails = result.canReadEmails
      ? await readEmails([member.authUserId])
      : new Map<string, string | null>();

    const { access } = result;
    const blocked = target.isSelf || target.isProtected;
    const outranks =
      target.actorRank !== null && target.actorRank > target.targetRank;

    return {
      member: {
        id: member.id,
        authUserId: member.authUserId,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
        isActive: member.isActive,
        displayName: getDisplayName(member.metadata),
        email: emails.get(member.authUserId) ?? null,
        role: member.roleId
          ? {
              id: member.roleId,
              name: member.roleName ?? '',
              description: member.roleDescription,
              rank: member.roleRank,
              assignedAt: member.assignedAt,
            }
          : null,
      },
      access: {
        isSelf: target.isSelf,
        isProtected: target.isProtected,
        canChangeStatus: !blocked && target.canActionAccount,
        // Los mismos requisitos que `checkRoleChange`: asignar exige
        // `role:insert` (y `role:delete` si hay que quitar el rol actual) y
        // una cuenta activa; quitar el rol exige `role:delete`.
        canAssignRole:
          !blocked &&
          outranks &&
          member.isActive &&
          access.canInsertRoles &&
          (!member.roleId || access.canDeleteRoles),
        canRemoveRole:
          !blocked &&
          outranks &&
          Boolean(member.roleId) &&
          access.canDeleteRoles,
      },
      assignableRoles: result.assignableRoles,
    };
  }

  /**
   * Cambia el rol de un miembro: quita `rolesToRemove` y asigna
   * `rolesToAdd` en UNA transacción (si falla cualquier paso, no cambia
   * nada). Una cuenta solo tiene un rol (`unique (account_id)`), así que
   * «cambiar de rol» es quitar el actual y asignar el nuevo.
   *
   * @throws `SettingsError` con el motivo (`MEMBER_*`).
   */
  async updateMemberRoles(
    id: string,
    changes: { rolesToAdd: string[]; rolesToRemove: string[] },
  ) {
    const client = this.context.get('drizzle');

    // Los rechazos esperados (permiso, rango, uno mismo…) se devuelven desde
    // la transacción y se lanzan fuera, como en el registro de auditoría: el
    // cliente Drizzle registra como fallo cualquier error lanzado dentro. Se
    // comprueban ANTES de escribir nada, así que no hay nada que deshacer; si
    // una escritura falla después (RLS, carrera), sí se lanza dentro y la
    // transacción se revierte entera.
    const rejection = await client.runTransaction(async (tx) => {
      const rejected = await checkRoleChange(tx, id, changes);

      if (rejected) {
        return rejected;
      }

      const actorAccountId = (await readTargetAccess(tx, id)).actorAccountId;

      try {
        if (changes.rolesToRemove.length > 0) {
          const removed = await tx
            .delete(accountRolesInCms)
            .where(
              and(
                eq(accountRolesInCms.accountId, id),
                inArray(accountRolesInCms.roleId, changes.rolesToRemove),
              ),
            )
            .returning({ roleId: accountRolesInCms.roleId });

          // RLS filtra en silencio las filas que no deja borrar: si faltan,
          // la base de datos lo ha rechazado.
          if (removed.length !== changes.rolesToRemove.length) {
            throw new SettingsError(
              CMS_API_ERROR_CODES.MEMBER_RANK_DENIED,
              'RLS filtered the role removal',
            );
          }
        }

        if (changes.rolesToAdd.length > 0) {
          await tx.insert(accountRolesInCms).values(
            changes.rolesToAdd.map((roleId) => ({
              accountId: id,
              roleId,
              assignedBy: actorAccountId,
            })),
          );
        }
      } catch (error) {
        throw fromMemberRolesDbError(error) ?? error;
      }

      return null;
    });

    if (rejection) {
      throw rejection;
    }
  }

  /**
   * Activa o desactiva la cuenta de un miembro con `cms.set_account_active`,
   * que aplica las reglas de rango, retira o devuelve el claim `cms_access`
   * y deja la entrada de auditoría a nombre de quien actúa.
   *
   * @throws `SettingsError` con el motivo (`MEMBER_*`).
   */
  async setMemberActive(id: string, isActive: boolean) {
    const client = this.context.get('drizzle');

    const rows = await client.runTransaction(async (tx) =>
      tx.execute(
        sql`select cms.set_account_active(${id}::uuid, ${isActive}) as result`,
      ),
    );

    const outcome = rows[0]?.['result'] as
      | { success?: boolean; error?: string }
      | undefined;

    if (!outcome?.success) {
      throw fromSetAccountActiveCode(outcome?.error);
    }
  }
}

/** Permisos del usuario actual relevantes para los miembros. */
async function readAccess(tx: Tx) {
  const [row] = (await tx.execute(sql`
    select
      cms.has_admin_permission('account'::cms.system_resource, 'select'::cms.system_action) as can_read_members,
      -- Los correos salen de auth.users con el cliente administrador: se
      -- exige el mismo permiso que el explorador de usuarios, no basta con
      -- ver las cuentas del CMS.
      cms.has_admin_permission('auth_user'::cms.system_resource, 'select'::cms.system_action) as can_read_emails,
      cms.has_admin_permission('role'::cms.system_resource, 'insert'::cms.system_action) as can_insert_roles,
      cms.has_admin_permission('role'::cms.system_resource, 'delete'::cms.system_action) as can_delete_roles
  `)) as Array<{
    can_read_members: boolean | null;
    can_read_emails: boolean | null;
    can_insert_roles: boolean | null;
    can_delete_roles: boolean | null;
  }>;

  return {
    canReadMembers: row?.can_read_members === true,
    canReadEmails: row?.can_read_emails === true,
    canInsertRoles: row?.can_insert_roles === true,
    canDeleteRoles: row?.can_delete_roles === true,
  };
}

/**
 * Relación entre el usuario actual y la cuenta destino: si existe, si es
 * la propia, si es raíz, los rangos de ambos y si las funciones SQL le
 * dejarían actuar sobre ella.
 */
async function readTargetAccess(tx: Tx, id: string) {
  const [row] = (await tx.execute(sql`
    select
      exists (select 1 from cms.accounts where id = ${id}::uuid) as exists,
      coalesce((select is_active from cms.accounts where id = ${id}::uuid), false) as is_active,
      cms.get_current_user_account_id() as actor_account_id,
      cms.get_current_user_account_id() = ${id}::uuid as is_self,
      cms.is_root_managed_account(${id}::uuid) as is_protected,
      cms.get_user_max_role_rank(cms.get_current_user_account_id()) as actor_rank,
      coalesce(cms.get_user_max_role_rank(${id}::uuid), 0) as target_rank,
      cms.can_action_account(${id}::uuid, 'update'::cms.system_action) as can_action_account,
      (
        cms.has_admin_permission('role'::cms.system_resource, 'insert'::cms.system_action)
        or cms.has_admin_permission('role'::cms.system_resource, 'delete'::cms.system_action)
      ) as can_manage_roles
  `)) as Array<{
    exists: boolean;
    is_active: boolean;
    actor_account_id: string | null;
    is_self: boolean | null;
    is_protected: boolean | null;
    actor_rank: number | null;
    target_rank: number;
    can_action_account: boolean | null;
    can_manage_roles: boolean | null;
  }>;

  return {
    exists: row?.exists === true,
    isActive: row?.is_active === true,
    actorAccountId: row?.actor_account_id ?? null,
    isSelf: row?.is_self === true,
    isProtected: row?.is_protected === true,
    actorRank: row?.actor_rank ?? null,
    targetRank: row?.target_rank ?? 0,
    canActionAccount: row?.can_action_account === true,
    canManageRoles: row?.can_manage_roles === true,
  };
}

/**
 * Comprueba un cambio de rol sin escribir nada y devuelve el motivo del
 * rechazo (o `null` si se puede hacer): permisos de rol, que la cuenta
 * exista y no sea la propia ni raíz, que el cambio sea coherente (una
 * cuenta tiene como mucho un rol) y los rangos de `can_modify_account_role`.
 */
async function checkRoleChange(
  tx: Tx,
  id: string,
  changes: { rolesToAdd: string[]; rolesToRemove: string[] },
) {
  const access = await readAccess(tx);

  if (
    (changes.rolesToAdd.length > 0 && !access.canInsertRoles) ||
    (changes.rolesToRemove.length > 0 && !access.canDeleteRoles)
  ) {
    return new SettingsError(
      CMS_API_ERROR_CODES.MEMBER_PERMISSION_DENIED,
      'Missing role permission',
    );
  }

  // Bloquea la cuenta destino hasta el final de la transacción: nadie puede
  // desactivarla entre la comprobación de `is_active` y la asignación.
  await tx.execute(
    sql`select 1 from cms.accounts where id = ${id}::uuid for update`,
  );

  const target = await readTargetAccess(tx, id);

  if (!target.exists) {
    return new SettingsError(
      CMS_API_ERROR_CODES.MEMBER_NOT_FOUND,
      `Member ${id} not found`,
    );
  }

  if (target.isSelf) {
    return new SettingsError(
      CMS_API_ERROR_CODES.MEMBER_SELF_ACTION,
      'Cannot change own roles',
    );
  }

  if (target.isProtected) {
    return new SettingsError(
      CMS_API_ERROR_CODES.MEMBER_PROTECTED,
      'Root account roles are managed by the platform',
    );
  }

  const current = await tx
    .select({ roleId: accountRolesInCms.roleId })
    .from(accountRolesInCms)
    .where(eq(accountRolesInCms.accountId, id));

  const currentIds = new Set(current.map((row) => row.roleId));
  const remaining = [...currentIds].filter(
    (roleId) => !changes.rolesToRemove.includes(roleId),
  );

  // Quitar un rol que no tiene, o asignar uno sin quitar el actual.
  if (
    changes.rolesToRemove.some((roleId) => !currentIds.has(roleId)) ||
    (changes.rolesToAdd.length > 0 && remaining.length > 0)
  ) {
    return new SettingsError(
      CMS_API_ERROR_CODES.MEMBER_INVALID_DATA,
      'Invalid role change',
    );
  }

  if (changes.rolesToAdd.length > 0 && !target.isActive) {
    return new SettingsError(
      CMS_API_ERROR_CODES.MEMBER_INACTIVE,
      'Cannot assign roles to an inactive member',
    );
  }

  for (const roleId of changes.rolesToRemove) {
    const rejected = await checkRoleRank(tx, id, roleId, 'delete');

    if (rejected) {
      return rejected;
    }
  }

  for (const roleId of changes.rolesToAdd) {
    const rejected = await checkRoleRank(tx, id, roleId, 'insert');

    if (rejected) {
      return rejected;
    }
  }

  return null;
}

/**
 * Devuelve el rechazo si `cms.can_modify_account_role` no permite quitar o asignar ese rol
 * a esa cuenta (rango del rol y de la cuenta). Es la misma función que usa
 * la política RLS de `cms.account_roles`.
 */
async function checkRoleRank(
  tx: Tx,
  accountId: string,
  roleId: string,
  action: 'insert' | 'delete',
) {
  const [row] = (await tx.execute(sql`
    select
      exists (select 1 from cms.roles where id = ${roleId}::uuid) as role_exists,
      cms.can_modify_account_role(
        cms.get_current_user_account_id(),
        ${accountId}::uuid,
        ${roleId}::uuid,
        ${action}::cms.system_action
      ) as allowed
  `)) as Array<{ role_exists: boolean; allowed: boolean | null }>;

  if (!row?.role_exists) {
    return new SettingsError(
      CMS_API_ERROR_CODES.MEMBER_INVALID_DATA,
      `Role ${roleId} does not exist`,
    );
  }

  if (row.allowed !== true) {
    return new SettingsError(
      CMS_API_ERROR_CODES.MEMBER_RANK_DENIED,
      `Cannot ${action} role ${roleId} for ${accountId}`,
    );
  }

  return null;
}

/**
 * Ids de usuario de Auth del PERSONAL del CMS cuyo correo coincide con el
 * patrón (ya escapado). Se cruza con `cms.accounts` antes de filtrar: con un
 * límite sobre todos los usuarios de la plataforma (clientes incluidos), un
 * fragmento común como `.com` dejaba fuera a miembros al azar. Usa el
 * cliente administrador: solo se llama tras comprobar que el lector puede
 * ver correos y solo devuelve ids.
 */
async function findAuthUserIdsByEmail(pattern: string) {
  const rows = (await getDrizzleSupabaseAdminClient().execute(
    sql`select a.auth_user_id::text as id
        from cms.accounts a
        join auth.users u on u.id = a.auth_user_id
        where u.email ilike ${pattern}`,
  )) as unknown as Array<{ id: string }>;

  return rows.map((row) => row.id);
}

/**
 * Correos de Auth de los usuarios indicados (solo `id` y `email`, nunca
 * `select *`, que traería los *hashes* de las contraseñas; bitácora B-38).
 */
async function readEmails(authUserIds: string[]) {
  const ids = [...new Set(authUserIds)];

  if (ids.length === 0) {
    return new Map<string, string | null>();
  }

  const rows = (await getDrizzleSupabaseAdminClient().execute(
    sql`select id::text as id, email from auth.users where id in (${sql.join(
      ids.map((userId) => sql`${userId}::uuid`),
      sql`, `,
    )})`,
  )) as unknown as Array<{ id: string; email: string | null }>;

  return new Map(rows.map((row) => [row.id, row.email]));
}

/** Nombre visible guardado en `metadata` (`display_name` o `username`). */
function getDisplayName(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const { display_name: displayName, username } = metadata as Record<
    string,
    unknown
  >;

  if (typeof displayName === 'string' && displayName.trim()) {
    return displayName.trim();
  }

  if (typeof username === 'string' && username.trim()) {
    return username.trim();
  }

  return null;
}

/** Escapa los comodines de `LIKE` (`%`, `_` y la barra invertida). */
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
