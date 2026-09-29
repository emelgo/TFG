import { and, desc, eq, inArray, like, sql } from 'drizzle-orm';
import { Context } from 'hono';

import { getDrizzleSupabaseAdminClient } from '@pymekit/cms-supabase/client';
import {
  accountRolesInCms,
  accountsInCms,
  rolesInCms,
} from '@pymekit/cms-supabase/schema';

/**
 * Creates a MembersService instance.
 */
export function createMembersService(c: Context) {
  return new MembersService(c);
}

/**
 * @name MembersService
 * @description Service for managing account members and roles
 */
class MembersService {
  constructor(private readonly context: Context) {}

  /**
   * Get all accounts with their roles
   * @param props - The properties for the query
   * @param props.page - The page number
   * @param props.limit - The number of members to return
   * @param props.search - The search query
   * @returns The members with their roles and pagination metadata
   */
  async getMembers(props: { page: number; limit: number; search?: string }) {
    const client = this.context.get('drizzle');
    const adminClient = getDrizzleSupabaseAdminClient();

    return client.runTransaction(async (tx) => {
      const conditions = props.search
        ? like(
            sql`CONCAT(
            COALESCE(${accountsInCms.metadata}->>'display_name', ''),
            ' ',
            COALESCE(${accountsInCms.metadata}->>'email', '')
          )`,
            `%${props.search}%`,
          )
        : undefined;

      // Build the base query for counting total records
      const totalCountQuery = tx
        .select({ count: sql`count(*)` })
        .from(accountsInCms)
        .where(conditions);

      // Get total count
      const totalCountResult = await totalCountQuery;
      const total = Number(totalCountResult[0]?.count) || 0;

      // Calculate pagination metadata
      const pageSize = props.limit;
      const pageIndex = props.page - 1; // Convert to 0-based index
      const pageCount = Math.ceil(total / pageSize);

      // Query accounts with their roles
      const accountsWithRolesQuery = tx
        .select({
          account: {
            id: accountsInCms.id,
            authUserId: accountsInCms.authUserId,
            createdAt: accountsInCms.createdAt,
            updatedAt: accountsInCms.updatedAt,
            metadata: accountsInCms.metadata,
            isActive: accountsInCms.isActive,
          },
        })
        .from(accountsInCms)
        .orderBy(desc(accountsInCms.createdAt))
        .limit(props.limit)
        .offset((props.page - 1) * props.limit);

      if (props.search) {
        accountsWithRolesQuery.where(
          like(
            sql`CONCAT(
              COALESCE(${accountsInCms.metadata}->>'display_name', ''),
              ' ',
              COALESCE(${accountsInCms.metadata}->>'email', '')
            )`,
            `%${props.search}%`,
          ),
        );
      }

      const accountsWithRoles = await accountsWithRolesQuery;

      // Reading auth.users goes through the RLS-bypassing admin client, so it
      // must be gated by the same auth_user:select permission the users-explorer
      // enforces — otherwise an admin without that grant could enumerate emails.
      const canReadAuthUsers = await this.hasAuthUserReadPermission(tx);

      // For each account, get their roles
      const data = await Promise.all(
        accountsWithRoles.map(async ({ account }) => {
          const userRoles = await tx
            .select({
              role: {
                id: rolesInCms.id,
                name: rolesInCms.name,
                description: rolesInCms.description,
                rank: rolesInCms.rank,
              },
              assignedAt: accountRolesInCms.assignedAt,
            })
            .from(accountRolesInCms)
            .innerJoin(rolesInCms, eq(accountRolesInCms.roleId, rolesInCms.id))
            .where(eq(accountRolesInCms.accountId, account.id));

          // Get user profile data from metadata
          const metadata = (account.metadata as Record<string, unknown>) || {};
          let displayName = metadata['display_name'];

          const pictureUrl = (metadata['picture_url'] || null) as string | null;
          const email = (metadata['email'] || null) as string | null;

          if (!displayName) {
            if (canReadAuthUsers) {
              const users = await adminClient.execute(
                sql`SELECT id, email FROM auth.users WHERE id = ${account.authUserId}`,
              );

              const user = users[0] as {
                email: string;
              };

              displayName = user ? user.email : '-';
            } else {
              displayName = '-';
            }
          }

          return {
            account,
            displayName,
            email,
            pictureUrl,
            roles: userRoles,
            highestRoleRank: userRoles.length
              ? Math.max(...userRoles.map((r) => r.role.rank || 0))
              : 0,
          };
        }),
      );

      return {
        data,
        pageSize,
        pageIndex,
        pageCount,
        total,
      };
    });
  }

  /**
   * Get member details
   * @param id - The member ID
   * @returns The member details
   */
  async getMemberDetails(id: string) {
    const client = this.context.get('drizzle');
    const adminClient = getDrizzleSupabaseAdminClient();

    return client.runTransaction(async (tx) => {
      // First, get the account details
      const account = await tx
        .select()
        .from(accountsInCms)
        .where(eq(accountsInCms.id, id))
        .limit(1)
        .then((res) => res[0]);

      if (!account) {
        throw new Error('Member not found');
      }

      // Get user details from auth — gated by auth_user:select since this uses
      // the RLS-bypassing admin client. Project only the columns we expose
      // (never SELECT *, which would pull password hashes / recovery tokens).
      const canReadAuthUsers = await this.hasAuthUserReadPermission(tx);

      const authUser = canReadAuthUsers
        ? (
            await adminClient.execute(
              sql`SELECT id, email FROM auth.users WHERE id = ${account.authUserId}`,
            )
          )[0]
        : undefined;

      // Get roles assigned to the account
      const accountRoles = await tx
        .select({
          id: rolesInCms.id,
          name: rolesInCms.name,
          description: rolesInCms.description,
          rank: rolesInCms.rank,
          validFrom: accountRolesInCms.validFrom,
          validUntil: accountRolesInCms.validUntil,
          assignedAt: accountRolesInCms.assignedAt,
          assignedBy: accountRolesInCms.assignedBy,
          updatedAt: rolesInCms.updatedAt,
          createdAt: rolesInCms.createdAt,
          metadata: rolesInCms.metadata,
        })
        .from(accountRolesInCms)
        .innerJoin(rolesInCms, eq(accountRolesInCms.roleId, rolesInCms.id))
        .where(eq(accountRolesInCms.accountId, id));

      return {
        account,
        roles: accountRoles,
        user: {
          id: authUser ? authUser['id'] : account.authUserId,
          email: authUser ? authUser['email'] : null,
        },
      };
    });
  }

  /**
   * Whether the current user holds the auth_user:select permission, required
   * before reading auth.users through the RLS-bypassing admin client.
   */
  private async hasAuthUserReadPermission(tx: {
    execute: (
      query: ReturnType<typeof sql>,
    ) => Promise<Record<string, unknown>[]>;
  }) {
    const result = await tx.execute(
      sql`select cms.has_admin_permission('auth_user'::cms.system_resource, 'select'::cms.system_action) as can_read`,
    );

    return result[0]?.['can_read'] === true;
  }

  /**
   * Update a member's role
   * @param params - The parameters for the update
   * @param params.accountId - The account ID
   * @param params.roleId - The role ID
   * @returns The updated role
   */
  async updateMemberRole(params: { accountId: string; roleId: string }) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      // Check if the role assignment already exists
      const existingRole = await tx
        .select()
        .from(accountRolesInCms)
        .where(
          and(
            eq(accountRolesInCms.accountId, params.accountId),
            eq(accountRolesInCms.roleId, params.roleId),
          ),
        )
        .limit(1);

      // If the role is already assigned, return it
      if (existingRole.length > 0) {
        return existingRole[0];
      }

      // Upsert the new role assignment
      return tx
        .insert(accountRolesInCms)
        .values({
          accountId: params.accountId,
          roleId: params.roleId,
          assignedAt: new Date().toISOString(),
          validFrom: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: accountRolesInCms.accountId,
          set: {
            roleId: params.roleId,
            assignedAt: new Date().toISOString(),
            validFrom: new Date().toISOString(),
          },
        })
        .returning();
    });
  }

  /**
   * Update member roles with batch operations
   * @param memberId - The member account ID
   * @param updates - The roles to add and remove
   * @returns The success status
   */
  async updateMemberRoles(
    memberId: string,
    updates: {
      rolesToAdd: string[];
      rolesToRemove: string[];
    },
  ) {
    const { rolesToAdd, rolesToRemove } = updates;
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      // Add new roles
      if (rolesToAdd.length > 0) {
        const values = rolesToAdd.map((roleId) => ({
          accountId: memberId,
          roleId,
          assignedAt: new Date().toISOString(),
        }));

        await tx.insert(accountRolesInCms).values(values).onConflictDoNothing(); // Skip if already exists
      }

      // Remove roles
      if (rolesToRemove.length > 0) {
        await tx
          .delete(accountRolesInCms)
          .where(
            and(
              eq(accountRolesInCms.accountId, memberId),
              inArray(accountRolesInCms.roleId, rolesToRemove),
            ),
          );
      }
    });
  }

  /**
   * Deactivate a member
   * @param id - The member ID
   * @returns The success status
   */
  async deactivateMember(id: string) {
    return this.setMemberActive(id, false);
  }

  /**
   * Activate a member
   * @param id - The member ID
   * @returns The success status
   */
  async activateMember(id: string) {
    return this.setMemberActive(id, true);
  }

  /**
   * Update a member's account
   * @param id - The member ID
   * @param data - The account data to update
   * @returns The success status
   */
  async updateAccount(
    id: string,
    data: { displayName: string; email: string },
  ) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      await tx
        .update(accountsInCms)
        .set({
          metadata: {
            display_name: data.displayName,
            email: data.email,
          },
        })
        .where(eq(accountsInCms.id, id));
    });
  }
  /**
   * Get account by auth user ID
   * @param authUserId - The auth user ID
   * @returns The account details
   */
  async getAccountByAuthId(authUserId: string) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return await tx
        .select()
        .from(accountsInCms)
        .where(eq(accountsInCms.authUserId, authUserId))
        .limit(1)
        .then((res) => res[0]);
    });
  }

  /**
   * Set a member's active status
   *
   * Runs on the RLS-scoped client rather than the admin pool: the admin connection
   * carries no JWT, so the rank check could not be re-evaluated at write time and the
   * audit row landed with a NULL actor. cms.set_account_active enforces the rank
   * check and clears the admin claim in the same transaction as the write.
   *
   * @param id - The member ID
   * @param isActive - The desired active status
   */
  private async setMemberActive(id: string, isActive: boolean) {
    const client = this.context.get('drizzle');

    const result = await client.runTransaction(async (tx) => {
      return tx.execute(
        sql`select cms.set_account_active(${id}, ${isActive}) as result`,
      );
    });

    const outcome = result[0]?.['result'] as
      | { success: boolean; error?: string }
      | undefined;

    if (!outcome?.success) {
      throw new Error(
        outcome?.error ?? 'You are not authorized to update this member',
      );
    }

    return outcome;
  }
}
