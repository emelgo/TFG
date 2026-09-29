/**
 * Bulk Permission Query Builder
 *
 * A stateless utility for building optimized UNION ALL queries for permission checks.
 * This enables batching multiple permission calls into a single database transaction.
 */

export type SystemAction = 'select' | 'insert' | 'update' | 'delete' | '*';
export type SystemResource =
  | 'role'
  | 'permission'
  | 'account'
  | 'system_setting'
  | 'table';

/**
 * Different types of permission checks that can be batched
 */
export interface DataPermissionCheck {
  type: 'data';
  key: string;
  action: SystemAction;
  schema: string;
  table: string;
  column?: string;
}

export interface AdminPermissionCheck {
  type: 'admin';
  key: string;
  resource: SystemResource;
  action: SystemAction;
}

export interface RoleActionCheck {
  type: 'role_action';
  key: string;
  roleId: string;
  action: 'update' | 'delete' | 'insert';
}

export interface AccountActionCheck {
  type: 'account_action';
  key: string;
  targetAccountId: string;
  action: 'update' | 'delete';
}

export interface PermissionActionCheck {
  type: 'permission_action';
  key: string;
  permissionId: string;
  action: 'update' | 'delete';
}

export interface PermissionGroupActionCheck {
  type: 'permission_group_action';
  key: string;
  groupId: string;
  action: 'update' | 'delete' | 'insert';
}

export interface AccountRoleModifyCheck {
  type: 'account_role_modify';
  key: string;
  currentAccountId: string;
  targetAccountId: string;
  roleId: string;
  action: 'insert' | 'update' | 'delete';
}

export interface UserMaxRoleRankCheck {
  type: 'user_max_role_rank';
  key: string;
}

export interface CurrentUserAccountCheck {
  type: 'current_user_account';
  key: string;
}

export type PermissionCheck =
  | DataPermissionCheck
  | AdminPermissionCheck
  | RoleActionCheck
  | AccountActionCheck
  | PermissionActionCheck
  | PermissionGroupActionCheck
  | AccountRoleModifyCheck
  | UserMaxRoleRankCheck
  | CurrentUserAccountCheck;

/**
 * Result of a bulk permission check
 */
export interface PermissionResult {
  key: string;
  result: boolean | string | number;
  type: 'boolean' | 'string' | 'number';
}

/**
 * Bulk Permission Query Builder
 *
 * Generates optimized UNION ALL queries for batching permission checks
 */
export class BulkPermissionBuilder {
  /**
   * Build a UNION ALL query for multiple permission checks
   * @param checks - Array of permission checks to batch
   * @returns SQL query string and parameter values
   */
  static buildQuery(checks: PermissionCheck[]): {
    query: string;
    params: unknown[];
  } {
    if (checks.length === 0) {
      return { query: '', params: [] };
    }

    const queryParts: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const check of checks) {
      const { sql, checkParams } = this.buildSingleCheck(check, paramIndex);
      queryParts.push(sql);
      params.push(...checkParams);
      paramIndex += checkParams.length;
    }

    const query = queryParts.join(' UNION ALL ');
    return { query, params };
  }

  /**
   * Build SQL for a single permission check
   * @param check - The permission check to build
   * @param paramIndex - Starting parameter index ($1, $2, etc.)
   * @returns SQL string and parameters
   */
  private static buildSingleCheck(
    check: PermissionCheck,
    paramIndex: number,
  ): { sql: string; checkParams: unknown[] } {
    switch (check.type) {
      case 'data':
        return this.buildDataPermissionCheck(check, paramIndex);

      case 'admin':
        return this.buildAdminPermissionCheck(check, paramIndex);

      case 'role_action':
        return this.buildRoleActionCheck(check, paramIndex);

      case 'account_action':
        return this.buildAccountActionCheck(check, paramIndex);

      case 'permission_action':
        return this.buildPermissionActionCheck(check, paramIndex);

      case 'permission_group_action':
        return this.buildPermissionGroupActionCheck(check, paramIndex);

      case 'account_role_modify':
        return this.buildAccountRoleModifyCheck(check, paramIndex);

      case 'user_max_role_rank':
        return this.buildUserMaxRoleRankCheck(check, paramIndex);

      case 'current_user_account':
        return this.buildCurrentUserAccountCheck(check, paramIndex);

      default:
        throw new Error(
          `Unknown permission check type: ${(check as PermissionCheck).type}`,
        );
    }
  }

  private static buildDataPermissionCheck(
    check: DataPermissionCheck,
    paramIndex: number,
  ): { sql: string; checkParams: unknown[] } {
    const keyParam = `$${paramIndex}`;
    const actionParam = `$${paramIndex + 1}`;
    const schemaParam = `$${paramIndex + 2}`;
    const tableParam = `$${paramIndex + 3}`;

    if (check.column) {
      const columnParam = `$${paramIndex + 4}`;
      return {
        sql: `SELECT ${keyParam} as key, 'boolean' as type, 
              cms.has_data_permission(
                ${actionParam}::cms.system_action,
                ${schemaParam},
                ${tableParam},
                ${columnParam}
              ) as result`,
        checkParams: [
          check.key,
          check.action,
          check.schema,
          check.table,
          check.column,
        ],
      };
    } else {
      return {
        sql: `SELECT ${keyParam} as key, 'boolean' as type,
              cms.has_data_permission(
                ${actionParam}::cms.system_action,
                ${schemaParam},
                ${tableParam}
              ) as result`,
        checkParams: [check.key, check.action, check.schema, check.table],
      };
    }
  }

  private static buildAdminPermissionCheck(
    check: AdminPermissionCheck,
    paramIndex: number,
  ): { sql: string; checkParams: unknown[] } {
    const keyParam = `$${paramIndex}`;
    const resourceParam = `$${paramIndex + 1}`;
    const actionParam = `$${paramIndex + 2}`;

    return {
      sql: `SELECT ${keyParam} as key, 'boolean' as type,
            cms.has_admin_permission(
              ${resourceParam}::cms.system_resource,
              ${actionParam}::cms.system_action
            ) as result`,
      checkParams: [check.key, check.resource, check.action],
    };
  }

  private static buildRoleActionCheck(
    check: RoleActionCheck,
    paramIndex: number,
  ): { sql: string; checkParams: unknown[] } {
    const keyParam = `$${paramIndex}`;
    const roleIdParam = `$${paramIndex + 1}`;
    const actionParam = `$${paramIndex + 2}`;

    return {
      sql: `SELECT ${keyParam} as key, 'boolean' as type,
            cms.can_action_role(
              ${roleIdParam}::uuid,
              ${actionParam}::cms.system_action
            ) as result`,
      checkParams: [check.key, check.roleId, check.action],
    };
  }

  private static buildAccountActionCheck(
    check: AccountActionCheck,
    paramIndex: number,
  ): { sql: string; checkParams: unknown[] } {
    const keyParam = `$${paramIndex}`;
    const accountIdParam = `$${paramIndex + 1}`;
    const actionParam = `$${paramIndex + 2}`;

    return {
      sql: `SELECT ${keyParam} as key, 'boolean' as type,
            cms.can_action_account(
              ${accountIdParam}::uuid,
              ${actionParam}::cms.system_action
            ) as result`,
      checkParams: [check.key, check.targetAccountId, check.action],
    };
  }

  private static buildPermissionActionCheck(
    check: PermissionActionCheck,
    paramIndex: number,
  ): { sql: string; checkParams: unknown[] } {
    const keyParam = `$${paramIndex}`;
    const permissionIdParam = `$${paramIndex + 1}`;
    const actionParam = `$${paramIndex + 2}`;

    return {
      sql: `SELECT ${keyParam} as key, 'boolean' as type,
            cms.can_modify_permission(
              ${permissionIdParam}::uuid,
              ${actionParam}::cms.system_action
            ) as result`,
      checkParams: [check.key, check.permissionId, check.action],
    };
  }

  private static buildPermissionGroupActionCheck(
    check: PermissionGroupActionCheck,
    paramIndex: number,
  ): { sql: string; checkParams: unknown[] } {
    const keyParam = `$${paramIndex}`;
    const groupIdParam = `$${paramIndex + 1}`;
    const actionParam = `$${paramIndex + 2}`;

    return {
      sql: `SELECT ${keyParam} as key, 'boolean' as type,
            cms.can_modify_permission_group(
              ${groupIdParam}::uuid,
              ${actionParam}::cms.system_action
            ) as result`,
      checkParams: [check.key, check.groupId, check.action],
    };
  }

  private static buildAccountRoleModifyCheck(
    check: AccountRoleModifyCheck,
    paramIndex: number,
  ): { sql: string; checkParams: unknown[] } {
    const keyParam = `$${paramIndex}`;
    const currentAccountParam = `$${paramIndex + 1}`;
    const targetAccountParam = `$${paramIndex + 2}`;
    const roleIdParam = `$${paramIndex + 3}`;
    const actionParam = `$${paramIndex + 4}`;

    return {
      sql: `SELECT ${keyParam} as key, 'boolean' as type,
            cms.can_modify_account_role(
              ${currentAccountParam}::uuid,
              ${targetAccountParam}::uuid,
              ${roleIdParam}::uuid,
              ${actionParam}::cms.system_action
            ) as result`,
      checkParams: [
        check.key,
        check.currentAccountId,
        check.targetAccountId,
        check.roleId,
        check.action,
      ],
    };
  }

  private static buildUserMaxRoleRankCheck(
    check: UserMaxRoleRankCheck,
    paramIndex: number,
  ): { sql: string; checkParams: unknown[] } {
    const keyParam = `$${paramIndex}`;

    return {
      sql: `SELECT ${keyParam} as key, 'number' as type,
            cms.get_user_max_role_rank(cms.get_current_user_account_id()) as result`,
      checkParams: [check.key],
    };
  }

  private static buildCurrentUserAccountCheck(
    check: CurrentUserAccountCheck,
    paramIndex: number,
  ): { sql: string; checkParams: unknown[] } {
    const keyParam = `$${paramIndex}`;

    return {
      sql: `SELECT ${keyParam} as key, 'string' as type,
            cms.get_current_user_account_id() as result`,
      checkParams: [check.key],
    };
  }

  /**
   * Parse results from a bulk permission query
   * @param rawResults - Raw database results
   * @returns Parsed permission results
   */
  static parseResults(
    rawResults: Array<{
      key: string;
      type: 'boolean' | 'string' | 'number';
      result: unknown;
    }>,
  ): Record<string, boolean | string | number> {
    const parsed: Record<string, boolean | string | number> = {};

    for (const row of rawResults) {
      switch (row.type) {
        case 'boolean':
          parsed[row.key] = Boolean(row.result);
          break;
        case 'string':
          parsed[row.key] = String(row.result || '');
          break;
        case 'number':
          parsed[row.key] = Number(row.result || 0);
          break;
      }
    }

    return parsed;
  }

  /**
   * Create a helper for building common permission check patterns
   */
  static builders = {
    /**
     * Create table CRUD permission checks
     */
    tableCRUD: (
      key: string,
      schema: string,
      table: string,
    ): DataPermissionCheck[] => [
      { type: 'data', key: `${key}_select`, action: 'select', schema, table },
      { type: 'data', key: `${key}_insert`, action: 'insert', schema, table },
      { type: 'data', key: `${key}_update`, action: 'update', schema, table },
      { type: 'data', key: `${key}_delete`, action: 'delete', schema, table },
    ],

    /**
     * Create entity access rights checks (update/delete)
     */
    entityAccess: {
      role: (roleId: string): RoleActionCheck[] => [
        { type: 'role_action', key: 'canUpdate', roleId, action: 'update' },
        { type: 'role_action', key: 'canDelete', roleId, action: 'delete' },
      ],

      permission: (permissionId: string): PermissionActionCheck[] => [
        {
          type: 'permission_action',
          key: 'canUpdate',
          permissionId,
          action: 'update',
        },
        {
          type: 'permission_action',
          key: 'canDelete',
          permissionId,
          action: 'delete',
        },
      ],

      permissionGroup: (groupId: string): PermissionGroupActionCheck[] => [
        {
          type: 'permission_group_action',
          key: 'canUpdate',
          groupId,
          action: 'update',
        },
        {
          type: 'permission_group_action',
          key: 'canDelete',
          groupId,
          action: 'delete',
        },
      ],
    },

    /**
     * Create admin permission checks for common resources
     */
    adminAccess: (
      resources: Array<{ resource: SystemResource; action: SystemAction }>,
    ): AdminPermissionCheck[] =>
      resources.map(({ resource, action }) => ({
        type: 'admin',
        key: `${resource}_${action}`,
        resource,
        action,
      })),
  };
}
