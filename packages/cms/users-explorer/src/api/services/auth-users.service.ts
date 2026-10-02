/**
 * Servicio de lectura y autorización del explorador de usuarios del CMS.
 *
 * Lee los usuarios de Supabase Auth (`auth.users`, identidades y factores
 * MFA) y decide qué puede hacer con ellos el miembro del personal que hace la
 * petición:
 *
 *  - los **permisos** salen del RBAC del CMS
 *    (`cms.has_admin_permission('auth_user', acción)`), consultados con los
 *    *claims* del usuario (Drizzle con contexto RLS);
 *  - la **protección** de cada usuario de destino (uno mismo, super-admin de
 *    la plataforma, personal del CMS) la decide `getUserProtection`.
 *
 * Para leer `auth.users` se usa el cliente Drizzle de servicio, porque ese
 * esquema no es accesible con RLS; por eso **cada** lectura comprueba antes
 * el permiso `select` (sin él, 403) y solo devuelve columnas concretas
 * (nunca la contraseña cifrada ni los *tokens*).
 *
 * [TFG] RF-09 · RNF-02: explorador de usuarios con autorización propia antes
 * de los clientes de servicio.
 */
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import { getDrizzleSupabaseAdminClient } from '@pymekit/cms-supabase/client';
import {
  getSupabaseAdminClient,
  getSupabaseClient,
} from '@pymekit/cms-supabase/hono';

import {
  getAdminAccessChange,
  getUserProtection,
  hasCmsAccessClaim,
  isPlatformSuperAdmin,
} from '../utils/user-protection';
import {
  UsersExplorerError,
  fromAuthAdminError,
  permissionDenied,
  protectionError,
} from '../utils/users-errors';

type UserRow = {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string | null;
  last_sign_in_at: string | null;
  confirmed_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  is_anonymous: boolean;
  raw_app_meta_data: Record<string, unknown> | null;
  raw_user_meta_data: Record<string, unknown> | null;
  is_banned: boolean;
};

/** Permisos del usuario actual sobre los usuarios de Auth. */
export type AuthUsersPermissions = {
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_insert: boolean;
};

/** Crea el servicio de usuarios de Auth de una petición. */
export function createAuthUsersService(context: Context) {
  return new AuthUsersService(context);
}

class AuthUsersService {
  private currentUserId: Promise<string> | undefined;

  constructor(private readonly context: Context) {}

  /**
   * Devuelve una página de usuarios, los más recientes primero, filtrada por
   * correo o teléfono.
   */
  async getUsers(params: { page: number; limit: number; search?: string }) {
    await this.requirePermission('select');

    const drizzle = getDrizzleSupabaseAdminClient();
    const offset = (params.page - 1) * params.limit;

    // El texto de búsqueda viaja como parámetro enlazado; `%` y `_` del
    // usuario solo amplían su propia búsqueda.
    const searchCondition = params.search
      ? sql` AND (au.email ILIKE ${`%${params.search}%`} OR au.phone ILIKE ${`%${params.search}%`})`
      : sql``;

    const [rows, countResult] = await Promise.all([
      drizzle.execute(sql`
        SELECT
          au.id, au.email, au.phone, au.created_at, au.updated_at,
          au.last_sign_in_at, au.confirmed_at, au.email_confirmed_at,
          au.banned_until, au.is_anonymous, au.raw_app_meta_data,
          au.raw_user_meta_data,
          (au.banned_until IS NOT NULL AND au.banned_until > NOW()) AS is_banned
        FROM auth.users au
        WHERE 1=1${searchCondition}
        ORDER BY au.created_at DESC
        LIMIT ${params.limit}
        OFFSET ${offset}
      `),
      drizzle.execute(sql`
        SELECT COUNT(*) AS total FROM auth.users au WHERE 1=1${searchCondition}
      `),
    ]);

    const total = Number((countResult[0] as { total: string }).total);
    const actorId = await this.getCurrentUserId();

    return {
      users: (rows as unknown as UserRow[]).map((row) => ({
        ...toPublicUser(row),
        is_self: row.id === actorId,
      })),
      total,
    };
  }

  /**
   * Devuelve la ficha de un usuario con sus identidades, sus factores MFA y
   * lo que el usuario actual puede hacer con él (`actions`).
   *
   * @throws `UsersExplorerError` 403 sin permiso y 404 si no existe.
   */
  async getUserById(id: string) {
    await this.requirePermission('select');

    const drizzle = getDrizzleSupabaseAdminClient();

    const [userRows, identityRows] = await Promise.all([
      drizzle.execute(sql`
        SELECT
          au.id, au.email, au.phone, au.created_at, au.updated_at,
          au.last_sign_in_at, au.confirmed_at, au.email_confirmed_at,
          au.banned_until, au.is_anonymous, au.raw_app_meta_data,
          au.raw_user_meta_data,
          (au.banned_until IS NOT NULL AND au.banned_until > NOW()) AS is_banned,
          sa.id AS account_id
        FROM auth.users au
        LEFT JOIN cms.accounts sa ON sa.auth_user_id = au.id
        WHERE au.id = ${id}
      `),
      drizzle.execute(sql`
        SELECT ai.id, ai.provider, ai.last_sign_in_at, ai.created_at
        FROM auth.identities ai
        WHERE ai.user_id = ${id}
        ORDER BY ai.created_at ASC
      `),
    ]);

    const row = userRows[0] as
      | (UserRow & { account_id: string | null })
      | undefined;

    if (!row) {
      throw new UsersExplorerError(
        CMS_API_ERROR_CODES.AUTH_USER_NOT_FOUND,
        `User ${id} not found`,
      );
    }

    const { data: mfaData } =
      await getSupabaseAdminClient().auth.admin.mfa.listFactors({ userId: id });

    const mfaFactors = (mfaData?.factors ?? []).map((factor) => ({
      id: factor.id,
      friendly_name: factor.friendly_name ?? null,
      factor_type: factor.factor_type,
      status: factor.status,
      created_at: factor.created_at,
    }));

    const identities = (
      identityRows as unknown as Array<{
        id: string;
        provider: string;
        last_sign_in_at: string | null;
        created_at: string;
      }>
    ).map((identity) => ({
      id: identity.id,
      provider: identity.provider,
      last_sign_in_at: identity.last_sign_in_at,
      created_at: identity.created_at,
    }));

    const [permissions, actorId] = await Promise.all([
      this.getPermissions(),
      this.getCurrentUserId(),
    ]);

    const actions = await this.getAvailableActions({
      actorId,
      targetId: row.id,
      appMetadata: row.raw_app_meta_data,
      accountId: row.account_id,
      permissions,
    });

    return {
      user: {
        ...toPublicUser(row),
        is_self: row.id === actorId,
        identities,
        mfa_factors: mfaFactors,
      },
      permissions,
      actions,
    };
  }

  /**
   * Calcula qué acciones puede ofrecer la interfaz sobre un usuario. Es solo
   * una ayuda visual: cada acción vuelve a comprobarse al ejecutarse.
   */
  private async getAvailableActions(params: {
    actorId: string;
    targetId: string;
    appMetadata: Record<string, unknown> | null;
    accountId: string | null;
    permissions: AuthUsersPermissions;
  }) {
    const protection = getUserProtection({
      actorId: params.actorId,
      targetId: params.targetId,
      targetAppMetadata: params.appMetadata,
      targetCmsAccount: params.accountId
        ? { outranked: await this.outranksCmsAccount(params.accountId) }
        : null,
    });

    const accessChange = getAdminAccessChange({
      actorId: params.actorId,
      targetId: params.targetId,
      targetAppMetadata: params.appMetadata,
    });

    let canChangeAdminAccess = false;

    if (accessChange && params.permissions.can_update) {
      canChangeAdminAccess = await this.canChangeAdminAccess(
        accessChange,
        params.accountId,
      );
    }

    return {
      /** Motivo por el que el usuario está protegido (`null` si no lo está). */
      protection,
      canUpdate: protection === null && params.permissions.can_update,
      canDelete: protection === null && params.permissions.can_delete,
      canGrantAdminAccess: accessChange === 'grant' && canChangeAdminAccess,
      canRevokeAdminAccess: accessChange === 'revoke' && canChangeAdminAccess,
    };
  }

  /**
   * Replica las comprobaciones de `cms.grant_admin_access` /
   * `cms.revoke_admin_access` (permiso `account` y jerarquía de rangos) para
   * saber si mostrar el botón.
   */
  private async canChangeAdminAccess(
    change: 'grant' | 'revoke',
    targetAccountId: string | null,
  ) {
    const action = change === 'grant' ? 'insert' : 'delete';
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      const result = await tx.execute(sql`
        SELECT
          cms.has_admin_permission('account'::cms.system_resource, ${action}::cms.system_action)
          AND (
            ${targetAccountId}::uuid IS NULL
            OR cms.can_action_account(${targetAccountId}::uuid, 'update'::cms.system_action)
          ) AS allowed
      `);

      return result[0]?.['allowed'] === true;
    });
  }

  /** Permisos del usuario actual sobre los usuarios de Auth. */
  async getPermissions(): Promise<AuthUsersPermissions> {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      const result = await tx.execute(
        sql`select cms.get_current_user_auth_users_permissions()`,
      );

      const permissions = result[0]?.[
        'get_current_user_auth_users_permissions'
      ] as Partial<AuthUsersPermissions> | undefined;

      return {
        can_read: permissions?.can_read === true,
        can_update: permissions?.can_update === true,
        can_delete: permissions?.can_delete === true,
        can_insert: permissions?.can_insert === true,
      };
    });
  }

  /** Indica si el usuario actual tiene `acción` sobre los usuarios de Auth. */
  async hasPermission(action: 'select' | 'update' | 'insert' | 'delete') {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      const result = await tx.execute(
        sql`select cms.has_admin_permission('auth_user'::cms.system_resource, ${action}::cms.system_action)`,
      );

      return result[0]?.['has_admin_permission'] === true;
    });
  }

  /** Exige `acción` sobre los usuarios de Auth o lanza un 403. */
  async requirePermission(action: 'select' | 'update' | 'insert' | 'delete') {
    if (!(await this.hasPermission(action))) {
      throw permissionDenied(`auth_user:${action}`);
    }
  }

  /**
   * Devuelve el id del usuario de la sesión: el `sub` del JWT, cuya firma ya
   * verificó el *middleware* de autenticación con `getClaims()`. Es la misma
   * identidad con la que Drizzle ejecuta las consultas (y con la que la base
   * de datos aplica RLS y `auth.uid()`), así que la comprobación «no sobre
   * uno mismo» usa exactamente el mismo usuario que el resto de barreras. Se
   * memoriza para no repetirla en las operaciones múltiples.
   */
  getCurrentUserId() {
    this.currentUserId ??= getSupabaseClient(this.context)
      .auth.getClaims()
      .then(({ data, error }) => {
        const sub = data?.claims?.sub;

        if (error || typeof sub !== 'string' || !sub) {
          throw permissionDenied('no verified session');
        }

        return sub;
      });

    return this.currentUserId;
  }

  /**
   * Exige que el usuario de destino exista y se pueda modificar desde el CMS
   * (no es uno mismo, ni super-admin, ni personal del CMS). Devuelve el
   * usuario de Auth para no volver a pedirlo.
   *
   * @throws `UsersExplorerError` 404 si no existe y 403 si está protegido.
   */
  async assertCanActionUser(userId: string) {
    const actorId = await this.getCurrentUserId();

    // Uno mismo se comprueba antes de ir a Auth: no depende del destino.
    if (actorId === userId) {
      throw protectionError('self');
    }

    const target = await this.getAuthUser(userId);

    const protection = getUserProtection({
      actorId,
      targetId: userId,
      targetAppMetadata: target.app_metadata,
      targetCmsAccount: await this.getTargetCmsAccount(userId),
    });

    if (protection) {
      throw protectionError(protection);
    }

    return target;
  }

  /**
   * Devuelve la cuenta del CMS del destino (si alguna vez fue personal del
   * CMS) y si el operador la supera en rango.
   *
   * El id se lee con el cliente de servicio: las políticas RLS de
   * `cms.accounts` ocultan las cuentas a quien no puede gestionarlas, y
   * entonces parecería que el destino nunca fue personal y quedaría sin
   * proteger. La comparación de rangos sí se hace con los *claims* del
   * operador (`cms.can_action_account`).
   */
  async getTargetCmsAccount(userId: string) {
    const rows = await getDrizzleSupabaseAdminClient().execute(
      sql`SELECT id FROM cms.accounts WHERE auth_user_id = ${userId}`,
    );

    const accountId = (rows[0] as { id?: string } | undefined)?.id;

    return accountId
      ? { outranked: await this.outranksCmsAccount(accountId) }
      : null;
  }

  /**
   * Indica si el operador tiene más rango que la cuenta del CMS indicada
   * (y permiso para gestionar cuentas). Sin ese permiso, `false`: quien no
   * puede gestionar personal tampoco puede tocar a quien lo fue.
   */
  private async outranksCmsAccount(accountId: string) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      const result = await tx.execute(
        sql`SELECT cms.can_action_account(${accountId}::uuid, 'update'::cms.system_action) AS outranked`,
      );

      return result[0]?.['outranked'] === true;
    });
  }

  /** Lee un usuario con la API de administración de Auth. */
  async getAuthUser(userId: string) {
    const { data, error } =
      await getSupabaseAdminClient().auth.admin.getUserById(userId);

    if (error || !data.user) {
      throw fromAuthAdminError(error ?? { status: 404 }, 'getUserById');
    }

    return data.user;
  }
}

/**
 * Proyección pública de una fila de `auth.users`: solo los campos que la
 * interfaz necesita. `app_metadata` se devuelve para mostrarlo (solo
 * lectura); marca además si es super-admin o personal del CMS.
 */
function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_sign_in_at: row.last_sign_in_at,
    confirmed_at: row.confirmed_at,
    email_confirmed_at: row.email_confirmed_at,
    banned_until: row.banned_until,
    is_anonymous: row.is_anonymous,
    is_banned: row.is_banned,
    is_super_admin: isPlatformSuperAdmin(row.raw_app_meta_data),
    has_cms_access: hasCmsAccessClaim(row.raw_app_meta_data),
    app_metadata: row.raw_app_meta_data ?? {},
    user_metadata: row.raw_user_meta_data ?? {},
  };
}
