import { sql } from 'drizzle-orm';
import { Context } from 'hono';

import { getDrizzleSupabaseAdminClient } from '@pymekit/cms-supabase/client';
import {
  getSupabaseAdminClient,
  getSupabaseClient,
} from '@pymekit/cms-supabase/hono';

type User = {
  id: string;
  email: string;
  phone: string;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string;
  confirmed_at: string;
  email_confirmed_at: string;
  banned_until: string;
  aud: string;
  is_anonymous: boolean;
  raw_app_meta_data: Record<string, unknown>;
  raw_user_meta_data: Record<string, unknown>;
  is_banned: boolean;
  account_id: string | null;
};

/**
 * @name createAuthUsersService
 * @description Creates a service for interacting with auth users
 * @param context - The Hono context
 */
export function createAuthUsersService(context: Context) {
  return new AuthUsersService(context);
}

/**
 * @name AuthUsersService
 * @description Service for interacting with auth users
 */
class AuthUsersService {
  constructor(private readonly context: Context) {}

  /**
   * @name getUsers
   * @description Get all auth users with pagination
   * @param params
   */
  async getUsers(params: { page?: number; limit?: number; search?: string }) {
    const canRead = await this.canReadAuthUser();

    if (!canRead) {
      throw new Error('You do not have permission to read auth users');
    }

    const drizzle = getDrizzleSupabaseAdminClient();

    const page = params.page || 1;
    const limit = params.limit || 25;
    const offset = (page - 1) * limit;

    let searchCondition = sql``;

    if (params.search) {
      const search = `%${params.search}%`;
      searchCondition = sql` AND (au.email ILIKE ${search} OR au.phone ILIKE ${search})`;
    }

    // Main query
    const query = sql`
      SELECT 
        au.id,
        au.email,
        au.phone,
        au.created_at,
        au.updated_at,
        au.last_sign_in_at,
        au.confirmed_at,
        au.email_confirmed_at,
        au.banned_until,
        au.aud,
        au.is_anonymous,
        au.raw_app_meta_data,
        au.raw_user_meta_data,
        (CASE WHEN au.banned_until IS NOT NULL AND au.banned_until > NOW() THEN true ELSE false END) as is_banned
      FROM auth.users au
      WHERE 1=1${searchCondition}
      ORDER BY au.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // Count query
    const countQuery = sql`
      SELECT COUNT(*) as total
      FROM auth.users au
      WHERE 1=1${searchCondition}
    `;

    // Execute queries
    const [rows, countResult] = await Promise.all([
      drizzle.execute(query),
      drizzle.execute(countQuery),
    ]);

    const total = Number((countResult[0] as { total: string }).total);

    const users = (rows as unknown as User[]).map((row) => ({
      id: row.id,
      email: row.email,
      phone: row.phone,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_sign_in_at: row.last_sign_in_at,
      confirmed_at: row.confirmed_at,
      email_confirmed_at: row.email_confirmed_at,
      banned_until: row.banned_until,
      aud: row.aud,
      is_anonymous: row.is_anonymous,
      app_metadata: row.raw_app_meta_data,
      user_metadata: row.raw_user_meta_data,
      is_banned: row.is_banned,
    }));

    return {
      users,
      total,
    };
  }

  /**
   * @name getUserById
   * @description Get a single user by ID with identities
   * @param id - The user ID
   */
  async getUserById(id: string) {
    const canRead = await this.canReadAuthUser();

    if (!canRead) {
      throw new Error('You do not have permission to read auth users');
    }

    const drizzle = getDrizzleSupabaseAdminClient();

    const query = sql`
      SELECT 
        au.id,
        au.email,
        au.phone,
        au.created_at,
        au.updated_at,
        au.last_sign_in_at,
        au.confirmed_at,
        au.email_confirmed_at,
        au.banned_until,
        au.aud,
        au.is_anonymous,
        au.raw_user_meta_data,
        au.raw_app_meta_data,
        (CASE WHEN au.banned_until IS NOT NULL AND au.banned_until > NOW() THEN true ELSE false END) as is_banned,
        sa.id as account_id
      FROM auth.users au
      LEFT JOIN cms.accounts sa ON sa.auth_user_id = au.id
      WHERE au.id = ${id}
    `;

    const identitiesQuery = sql`
      SELECT 
        ai.id,
        ai.provider,
        ai.provider_id,
        ai.identity_data,
        ai.last_sign_in_at,
        ai.created_at,
        ai.updated_at
      FROM auth.identities ai
      WHERE ai.user_id = ${id}
      ORDER BY ai.created_at ASC
    `;

    const [userRows, identityRows] = await Promise.all([
      drizzle.execute(query),
      drizzle.execute(identitiesQuery),
    ]);

    // Fetch MFA factors using Supabase Admin Client
    const supabaseAdmin = getSupabaseAdminClient();
    const { data: mfaData } = await supabaseAdmin.auth.admin.mfa.listFactors({
      userId: id,
    });

    const mfaFactors =
      mfaData?.factors?.map((factor) => ({
        id: factor.id,
        friendly_name: factor.friendly_name,
        factor_type: factor.factor_type,
        status: factor.status,
        created_at: factor.created_at,
        updated_at: factor.updated_at,
      })) || [];

    if (!userRows.length) {
      throw new Error(`User with ID ${id} not found`);
    }

    const row = userRows[0] as {
      id: string;
      email: string;
      phone: string;
      created_at: string;
      updated_at: string;
      last_sign_in_at: string;
      confirmed_at: string;
      email_confirmed_at: string;
      banned_until: string;
      aud: string;
      is_anonymous: boolean;
      raw_app_meta_data: Record<string, unknown>;
      raw_user_meta_data: Record<string, unknown>;
      is_banned: boolean;
      account_id: string | null;
    };

    const identities = (
      identityRows as unknown as {
        id: string;
        provider: string;
        provider_id: string;
        identity_data: Record<string, unknown>;
        last_sign_in_at: string | null;
        created_at: string;
        updated_at: string;
      }[]
    ).map((identity) => ({
      id: identity.id,
      provider: identity.provider,
      provider_id: identity.provider_id,
      identity_data: identity.identity_data,
      last_sign_in_at: identity.last_sign_in_at,
      created_at: identity.created_at,
      updated_at: identity.updated_at,
    }));

    return {
      user: {
        id: row.id,
        email: row.email,
        phone: row.phone,
        created_at: row.created_at,
        updated_at: row.updated_at,
        last_sign_in_at: row.last_sign_in_at,
        confirmed_at: row.confirmed_at,
        email_confirmed_at: row.email_confirmed_at,
        banned_until: row.banned_until,
        aud: row.aud,
        is_anonymous: row.is_anonymous,
        app_metadata: row.raw_app_meta_data,
        user_metadata: row.raw_user_meta_data,
        is_banned: row.is_banned,
        account_id: row.account_id,
        identities,
        mfa_factors: mfaFactors,
      },
    };
  }

  /**
   * @name getPermissions
   * @description Get the permissions the current user has for the Auth users in Supabase
   */
  async getPermissions() {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      const result = await tx.execute(
        sql`select cms.get_current_user_auth_users_permissions()`,
      );

      return result[0]?.['get_current_user_auth_users_permissions'] as {
        can_read: boolean;
        can_update: boolean;
        can_delete: boolean;
        can_insert: boolean;
      };
    });
  }

  /**
   * @name canReadAuthUser
   * @description Check if the current user has permission to read user information
   */
  async canReadAuthUser() {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      const result = await tx.execute(
        sql`select cms.has_admin_permission('auth_user'::cms.system_resource, 'select')`,
      );

      return result[0]?.['has_admin_permission'];
    });
  }

  /**
   * @name canUpdateAuthUser
   * @description Check if the current user has permission to update user informationget_auth_users_permissions
   */
  async canUpdateAuthUser() {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      const result = await tx.execute(
        sql`select cms.has_admin_permission('auth_user'::cms.system_resource, 'update')`,
      );

      return result[0]?.['has_admin_permission'];
    });
  }

  /**
   * @name canInsertAuthUser
   * @description Check if the current user has permission to insert user information
   */
  async canInsertAuthUser() {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      const result = await tx.execute(
        sql`select cms.has_admin_permission('auth_user'::cms.system_resource, 'insert')`,
      );

      return result[0]?.['has_admin_permission'];
    });
  }

  /**
   * @name canDeleteAuthUser
   * @description Check if the current user has permission to delete user information
   */
  async canDeleteAuthUser() {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      const result = await tx.execute(
        sql`select cms.has_admin_permission('auth_user'::cms.system_resource, 'delete')`,
      );

      return result[0]?.['has_admin_permission'];
    });
  }

  /**
   * @name assertUserIsNotActioningItself
   * @description Ensure the user is not actioning itself. User canot perform actions on themselves.
   * @param userId - The user ID
   */
  async assertUserIsNotActioningItself(userId: string) {
    const client = getSupabaseClient(this.context);

    // get current user
    const { data, error } = await client.auth.getUser();

    // if for any reason we fail to get the current user, throw an error
    if (error) {
      throw new Error('Failed to get user');
    }

    const isCurrentUserTryingToActionItself = data.user.id === userId;

    // if the current user is trying to action itself, throw an error
    if (isCurrentUserTryingToActionItself) {
      throw new Error('You cannot perform this action on yourself');
    }
  }

  /**
   * @name assertUserIsNotAdminAccount
   * @description Ensure the user is not an admin account
   * @param userId - The user ID
   */
  async assertUserIsNotAdminAccount(userId: string) {
    const client = getSupabaseAdminClient();
    const { data, error } = await client.auth.admin.getUserById(userId);

    if (error) {
      throw error;
    }

    const isAdminAccount = data.user.app_metadata['cms_access'] === 'true';

    if (isAdminAccount) {
      throw new Error(
        'You cannot perform this action on an admin account. Please first remove admin access from the user.',
      );
    }
  }
}
