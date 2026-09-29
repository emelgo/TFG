import { desc, eq, sql } from 'drizzle-orm';
import { Context } from 'hono';

import { rolesInCms } from '@pymekit/cms-supabase/schema';

/**
 * Create a roles service instance
 * @param context - The Hono context
 * @returns RolesService instance
 */
export function createRolesService(context: Context) {
  return new RolesService(context);
}

/**
 * Unified Roles service for handling all roles-related operations
 * Consolidates roles functionality from multiple feature packages
 */
class RolesService {
  constructor(private readonly context: Context) {}

  /**
   * Get all roles ordered by rank (highest rank first)
   * This is the consolidated implementation used across the application
   * @returns Array of roles with basic information
   */
  async getRoles() {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .select({
          id: rolesInCms.id,
          name: rolesInCms.name,
          description: rolesInCms.description,
          rank: rolesInCms.rank,
          validFrom: rolesInCms.validFrom,
          validUntil: rolesInCms.validUntil,
          metadata: rolesInCms.metadata,
          createdAt: rolesInCms.createdAt,
          updatedAt: rolesInCms.updatedAt,
        })
        .from(rolesInCms)
        .orderBy(desc(rolesInCms.rank));
    });
  }

  /**
   * Get roles for sharing/assignment purposes
   * Returns simplified role structure for dropdowns and selection components
   * Only returns roles that the current user can share with (lower rank than user's max role)
   * @returns Array of roles with id, name, description, and rank
   */
  async getRolesForSharing() {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      // Use SQL to get roles that the current user can share with
      // This leverages the existing database function to check hierarchy
      const result = await tx.execute(
        sql`
          SELECT id, name, description, rank
          FROM cms.roles
          WHERE rank < (SELECT cms.get_user_max_role_rank(cms.get_current_user_account_id()))
          AND (valid_until IS NULL OR valid_until > NOW())
          ORDER BY name
        `,
      );

      return result.map((row) => ({
        id: row['id'] as string,
        name: row['name'] as string,
        description: row['description'] as string | null,
        rank: row['rank'] as number,
      }));
    });
  }

  /**
   * Get a specific role by ID
   * @param roleId - The role ID
   * @returns The role or null if not found
   */
  async getRole(roleId: string) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      const roles = await tx
        .select()
        .from(rolesInCms)
        .where(eq(rolesInCms.id, roleId))
        .limit(1);

      return roles[0] || null;
    });
  }

  /**
   * Create a new role
   * @param data - The role data to create
   * @returns The created role
   */
  async createRole(data: typeof rolesInCms.$inferInsert) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .insert(rolesInCms)
        .values({
          name: data.name,
          description: data.description,
          rank: data.rank,
          validFrom: data.validFrom,
          validUntil: data.validUntil,
          metadata: data.metadata,
        })
        .returning();
    });
  }

  /**
   * Update an existing role
   * @param id - The role ID
   * @param data - The updated role data
   * @returns The updated role
   */
  async updateRole(id: string, data: typeof rolesInCms.$inferInsert) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .update(rolesInCms)
        .set({
          name: data.name,
          description: data.description,
          rank: data.rank,
          validFrom: data.validFrom,
          validUntil: data.validUntil,
          metadata: data.metadata,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(rolesInCms.id, id))
        .returning();
    });
  }

  /**
   * Delete a role
   * @param id - The role ID
   * @returns The deleted role
   */
  async deleteRole(id: string) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx.delete(rolesInCms).where(eq(rolesInCms.id, id)).returning();
    });
  }
}
