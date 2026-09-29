import { and, desc, eq, inArray } from 'drizzle-orm';
import { Context } from 'hono';

import {
  accountRolesInCms,
  permissionGroupPermissionsInCms,
  permissionGroupsInCms,
  permissionsInCms,
  rolePermissionGroupsInCms,
  rolePermissionsInCms,
  rolesInCms,
} from '@pymekit/cms-supabase/schema';

/**
 * Creates a PermissionsService instance.
 */
export function createPermissionsService(c: Context) {
  return new PermissionsService(c);
}

/**
 * Permissions service for handling roles, permissions, and permission groups.
 */
class PermissionsService {
  constructor(private readonly context: Context) {}

  /**
   * Get all roles
   * @returns The roles
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
   * Get a role by ID with permissions and permission groups
   * @param id - The ID of the role
   * @returns The role with permissions and permission groups
   */
  async getRole(id: string) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      // Get the role
      const role = await tx
        .select()
        .from(rolesInCms)
        .where(eq(rolesInCms.id, id))
        .limit(1)
        .then((rows) => rows[0]);

      if (!role) {
        return {
          roles: [],
          permissions: [],
          role_permissions: [],
          permission_groups: [],
          role_permission_groups: [],
        };
      }

      // Get the role's permissions
      const rolePermissions = await tx
        .select({
          role_permissions: rolePermissionsInCms,
          permissions: permissionsInCms,
        })
        .from(rolePermissionsInCms)
        .where(eq(rolePermissionsInCms.roleId, id))
        .innerJoin(
          permissionsInCms,
          eq(rolePermissionsInCms.permissionId, permissionsInCms.id),
        );

      // Get the role's permission groups
      const rolePermissionGroups = await tx
        .select({
          role_permission_groups: rolePermissionGroupsInCms,
          permission_groups: permissionGroupsInCms,
        })
        .from(rolePermissionGroupsInCms)
        .where(eq(rolePermissionGroupsInCms.roleId, id))
        .innerJoin(
          permissionGroupsInCms,
          eq(rolePermissionGroupsInCms.groupId, permissionGroupsInCms.id),
        );

      // Return the data in the expected format
      return {
        roles: [role],
        permissions: rolePermissions.map((rp) => rp.permissions),
        role_permissions: rolePermissions.map((rp) => rp.role_permissions),
        permission_groups: rolePermissionGroups.map(
          (rpg) => rpg.permission_groups,
        ),
        role_permission_groups: rolePermissionGroups.map(
          (rpg) => rpg.role_permission_groups,
        ),
      };
    });
  }

  /**
   * Create a new role
   * @param data - The data for the new role
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
          rank: data.rank || 0,
          metadata: data.metadata ? data.metadata : {},
        })
        .returning();
    });
  }

  /**
   * Update a role
   * @param id - The ID of the role
   * @param data - The data for the update
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
          metadata: data.metadata,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(rolesInCms.id, id))
        .returning();
    });
  }

  /**
   * Delete a role
   * @param id - The ID of the role
   * @returns The deleted role
   */
  async deleteRole(id: string) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx.delete(rolesInCms).where(eq(rolesInCms.id, id)).returning();
    });
  }

  /**
   * Get all permissions
   */
  async getPermissions() {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx.select().from(permissionsInCms).orderBy(permissionsInCms.name);
    });
  }

  /**
   * Get a permission by ID with related roles and groups
   * @param id - The ID of the permission
   * @returns The permission with related roles and groups
   */
  async getPermissionWithRelations(id: string) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      // Get permission
      const permission = await tx
        .select()
        .from(permissionsInCms)
        .where(eq(permissionsInCms.id, id))
        .limit(1)
        .then((data) => data[0]!);

      if (!permission) {
        throw new Error('Permission not found');
      }

      // Get roles using this permission
      const roles = await tx
        .select({
          id: rolesInCms.id,
          name: rolesInCms.name,
          description: rolesInCms.description,
          rank: rolesInCms.rank,
        })
        .from(rolePermissionsInCms)
        .innerJoin(rolesInCms, eq(rolePermissionsInCms.roleId, rolesInCms.id))
        .where(eq(rolePermissionsInCms.permissionId, id));

      // Get groups using this permission
      const groups = await tx
        .select({
          id: permissionGroupsInCms.id,
          name: permissionGroupsInCms.name,
          description: permissionGroupsInCms.description,
        })
        .from(permissionGroupPermissionsInCms)
        .innerJoin(
          permissionGroupsInCms,
          eq(permissionGroupPermissionsInCms.groupId, permissionGroupsInCms.id),
        )
        .where(eq(permissionGroupPermissionsInCms.permissionId, id));

      return { permission, roles, groups };
    });
  }

  /**
   * Create a new permission
   * @param data - The data for the new permission
   * @returns The created permission
   */
  async createPermission(data: typeof permissionsInCms.$inferInsert) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .insert(permissionsInCms)
        .values({
          name: data.name,
          description: data.description,
          permissionType: data.permissionType,
          systemResource: data.systemResource,
          scope: data.scope,
          action: data.action,
          schemaName: data.schemaName,
          tableName: data.tableName,
          columnName: data.columnName,
          constraints: data.constraints,
          conditions: data.conditions,
          metadata: data.metadata,
        })
        .returning();
    });
  }

  /**
   * Update a permission
   * @param id - The ID of the permission
   * @param data - The data for the update
   * @returns The updated permission
   */
  async updatePermission(
    id: string,
    data: typeof permissionsInCms.$inferInsert,
  ) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .update(permissionsInCms)
        .set({
          name: data.name,
          description: data.description,
          permissionType: data.permissionType,
          scope: data.scope,
          action: data.action,
          schemaName: data.schemaName,
          systemResource: data.systemResource,
          tableName: data.tableName,
          columnName: data.columnName,
          constraints: data.constraints,
          conditions: data.conditions,
          metadata: data.metadata,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(permissionsInCms.id, id))
        .returning();
    });
  }

  /**
   * Delete a permission
   * @param id - The ID of the permission
   * @returns The deleted permission
   */
  async deletePermission(id: string) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .delete(permissionsInCms)
        .where(eq(permissionsInCms.id, id))
        .returning();
    });
  }

  /**
   * Get all permission groups
   * @returns The permission groups
   */
  async getPermissionGroups() {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .select()
        .from(permissionGroupsInCms)
        .orderBy(permissionGroupsInCms.name);
    });
  }

  /**
   * Get a permission group by ID
   * @param id - The ID of the permission group
   * @returns The permission group
   */
  async getPermissionGroup(id: string) {
    const client = await this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .select()
        .from(permissionGroupsInCms)
        .where(eq(permissionGroupsInCms.id, id))
        .limit(1)
        .then((data) => data[0]);
    });
  }

  /**
   * Get permissions for a role
   * @param roleId - The ID of the role
   * @returns The permissions for the role
   */
  async getRolePermissions(roleId: string) {
    const client = await this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .select({
          roleId: rolePermissionsInCms.roleId,
          permissionId: rolePermissionsInCms.permissionId,
          grantedAt: rolePermissionsInCms.grantedAt,
          validFrom: rolePermissionsInCms.validFrom,
          validUntil: rolePermissionsInCms.validUntil,
          conditions: rolePermissionsInCms.conditions,
          permission: {
            id: permissionsInCms.id,
            name: permissionsInCms.name,
            description: permissionsInCms.description,
            scope: permissionsInCms.scope,
            action: permissionsInCms.action,
          },
        })
        .from(rolePermissionsInCms)
        .innerJoin(
          permissionsInCms,
          eq(rolePermissionsInCms.permissionId, permissionsInCms.id),
        )
        .where(eq(rolePermissionsInCms.roleId, roleId));
    });
  }

  /**
   * Assign a permission to a role
   * @param data - The data for the assignment
   * @returns The assigned permission
   */
  async assignPermissionToRole(data: typeof rolePermissionsInCms.$inferInsert) {
    const client = await this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .insert(rolePermissionsInCms)
        .values({
          roleId: data.roleId,
          permissionId: data.permissionId,
          validFrom: data.validFrom,
          validUntil: data.validUntil,
          conditions: data.conditions,
        })
        .returning();
    });
  }

  /**
   * Remove a permission from a role
   * @param roleId - The ID of the role
   * @param permissionId - The ID of the permission
   * @returns The removed permission
   */
  async removePermissionFromRole(roleId: string, permissionId: string) {
    const client = await this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .delete(rolePermissionsInCms)
        .where(
          and(
            eq(rolePermissionsInCms.roleId, roleId),
            eq(rolePermissionsInCms.permissionId, permissionId),
          ),
        )
        .returning();
    });
  }

  /**
   * Get permission groups for a role
   * @param roleId - The ID of the role
   * @returns The permission groups for the role
   */
  async getRolePermissionGroups(roleId: string) {
    const client = await this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .select({
          roleId: rolePermissionGroupsInCms.roleId,
          groupId: rolePermissionGroupsInCms.groupId,
          assignedAt: rolePermissionGroupsInCms.assignedAt,
          validFrom: rolePermissionGroupsInCms.validFrom,
          validUntil: rolePermissionGroupsInCms.validUntil,
          group: {
            id: permissionGroupsInCms.id,
            name: permissionGroupsInCms.name,
            description: permissionGroupsInCms.description,
          },
        })
        .from(rolePermissionGroupsInCms)
        .innerJoin(
          permissionGroupsInCms,
          eq(rolePermissionGroupsInCms.groupId, permissionGroupsInCms.id),
        )
        .where(eq(rolePermissionGroupsInCms.roleId, roleId));
    });
  }

  /**
   * Assign a permission group to a role
   * @param params - The parameters for the assignment
   * @param params.roleId - The ID of the role
   * @param params.groupId - The ID of the permission group
   * @param params.validFrom - The valid from date
   * @param params.validUntil - The valid until date
   * @param params.metadata - The metadata for the assignment
   * @returns The assigned permission group
   */
  async assignPermissionGroupToRole(
    params: typeof rolePermissionGroupsInCms.$inferInsert,
  ) {
    const client = await this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      // Check if assignment already exists
      const existing = await tx
        .select()
        .from(rolePermissionGroupsInCms)
        .where(
          and(
            eq(rolePermissionGroupsInCms.roleId, params.roleId),
            eq(rolePermissionGroupsInCms.groupId, params.groupId),
          ),
        );

      if (existing.length > 0) {
        // Already assigned, just return the existing assignment
        return existing;
      }

      // Create the assignment
      return tx
        .insert(rolePermissionGroupsInCms)
        .values({
          roleId: params.roleId,
          groupId: params.groupId,
          assignedAt: new Date().toISOString(),
          validFrom: params.validFrom,
          validUntil: params.validUntil,
          metadata: params.metadata,
        })
        .returning();
    });
  }

  /**
   * Remove a permission group from a role
   * @param roleId - The ID of the role
   * @param groupId - The ID of the permission group
   * @returns The removed permission group
   */
  async removePermissionGroupFromRole(roleId: string, groupId: string) {
    const client = await this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .delete(rolePermissionGroupsInCms)
        .where(
          and(
            eq(rolePermissionGroupsInCms.roleId, roleId),
            eq(rolePermissionGroupsInCms.groupId, groupId),
          ),
        )
        .returning();
    });
  }

  /**
   * Get permissions for a permission group
   * @param groupId - The ID of the permission group
   * @returns The permissions for the permission group
   */
  async getPermissionGroupPermissions(groupId: string) {
    const client = await this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .select({
          groupId: permissionGroupPermissionsInCms.groupId,
          permissionId: permissionGroupPermissionsInCms.permissionId,
          addedAt: permissionGroupPermissionsInCms.addedAt,
          conditions: permissionGroupPermissionsInCms.conditions,
          permission: {
            id: permissionsInCms.id,
            name: permissionsInCms.name,
            description: permissionsInCms.description,
            scope: permissionsInCms.scope,
            action: permissionsInCms.action,
            permissionType: permissionsInCms.permissionType,
            schemaName: permissionsInCms.schemaName,
            tableName: permissionsInCms.tableName,
            columnName: permissionsInCms.columnName,
          },
        })
        .from(permissionGroupPermissionsInCms)
        .innerJoin(
          permissionsInCms,
          eq(permissionGroupPermissionsInCms.permissionId, permissionsInCms.id),
        )
        .where(eq(permissionGroupPermissionsInCms.groupId, groupId));
    });
  }

  /**
   * Batch update permissions for a permission group
   * Handles adding and removing multiple permissions in a single transaction
   * @param groupId - The ID of the permission group
   * @param updates - The updates to make
   * @param updates.toAdd - The permissions to add
   * @param updates.toRemove - The permissions to remove
   * @returns The success status
   */
  async batchUpdateGroupPermissions(
    groupId: string,
    updates: {
      toAdd: string[];
      toRemove: string[];
    },
  ) {
    const { toAdd, toRemove } = updates;
    const client = await this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      // Add new permissions
      if (toAdd.length > 0) {
        const values = toAdd.map((permissionId) => ({
          groupId,
          permissionId,
          addedAt: new Date().toISOString(),
        }));

        await tx
          .insert(permissionGroupPermissionsInCms)
          .values(values)
          .onConflictDoNothing(); // Skip if already exists
      }

      // Remove permissions
      if (toRemove.length > 0) {
        await tx
          .delete(permissionGroupPermissionsInCms)
          .where(
            and(
              eq(permissionGroupPermissionsInCms.groupId, groupId),
              inArray(permissionGroupPermissionsInCms.permissionId, toRemove),
            ),
          );
      }

      return { success: true };
    });
  }

  /**
   * Create a new permission group
   * @param data - The data for the new permission group
   * @param data.name - The name of the permission group
   * @param data.description - The description of the permission group
   * @returns The created permission group
   */
  async createPermissionGroup(data: { name: string; description?: string }) {
    const client = this.context.get('drizzle');

    // first, insert the permission group
    await client.runTransaction(async (tx) => {
      return tx.insert(permissionGroupsInCms).values({
        name: data.name,
        description: data.description,
      });
    });

    // then, get the permission group by name (unique constraint)
    return client.runTransaction(async (tx) => {
      const group = await tx
        .select({
          id: permissionGroupsInCms.id,
        })
        .from(permissionGroupsInCms)
        .where(eq(permissionGroupsInCms.name, data.name))
        .limit(1)
        .then((data) => data[0]);

      if (!group) {
        throw new Error(`Permission group not found with name: ${data.name}`);
      }

      return group;
    });
  }

  /**
   * Update a permission group
   * @param id - The ID of the permission group
   * @param data - The data for the update
   * @returns The updated permission group
   */
  async updatePermissionGroup(
    id: string,
    data: typeof permissionGroupsInCms.$inferInsert,
  ) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .update(permissionGroupsInCms)
        .set({
          name: data.name,
          description: data.description,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(permissionGroupsInCms.id, id))
        .returning();
    });
  }

  /**
   * Delete a permission group
   * @param id - The ID of the permission group
   * @returns The deleted permission group
   */
  async deletePermissionGroup(id: string) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .delete(permissionGroupsInCms)
        .where(eq(permissionGroupsInCms.id, id))
        .returning();
    });
  }

  /**
   * Get roles for a permission group
   * @param groupId - The ID of the permission group
   * @returns The roles for the permission group
   */
  async getPermissionGroupRoles(groupId: string) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .select({
          roleId: rolePermissionGroupsInCms.roleId,
          groupId: rolePermissionGroupsInCms.groupId,
          assignedAt: rolePermissionGroupsInCms.assignedAt,
          validFrom: rolePermissionGroupsInCms.validFrom,
          validUntil: rolePermissionGroupsInCms.validUntil,
          role: {
            id: rolesInCms.id,
            name: rolesInCms.name,
            description: rolesInCms.description,
            rank: rolesInCms.rank,
          },
        })
        .from(rolePermissionGroupsInCms)
        .innerJoin(
          rolesInCms,
          eq(rolePermissionGroupsInCms.roleId, rolesInCms.id),
        )
        .where(eq(rolePermissionGroupsInCms.groupId, groupId));
    });
  }

  /**
   * Get roles assigned to a member
   * @param memberId - The member/account ID
   * @returns An array of roles assigned to the member
   */
  async getMemberRoles(memberId: string) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .select({
          id: rolesInCms.id,
          name: rolesInCms.name,
          description: rolesInCms.description,
          rank: rolesInCms.rank,
        })
        .from(accountRolesInCms)
        .innerJoin(rolesInCms, eq(accountRolesInCms.roleId, rolesInCms.id))
        .where(eq(accountRolesInCms.accountId, memberId));
    });
  }
}
