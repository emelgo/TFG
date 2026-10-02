import { describe, expect, it } from 'vitest';

import {
  BulkPermissionBuilder,
  type PermissionCheck,
} from '../../utils/bulk-permission-builder';

describe('BulkPermissionBuilder', () => {
  describe('buildQuery', () => {
    it('should return empty query for no checks', () => {
      const result = BulkPermissionBuilder.buildQuery([]);
      expect(result.query).toBe('');
      expect(result.params).toEqual([]);
    });

    it('should build single data permission check without column', () => {
      const checks: PermissionCheck[] = [
        {
          type: 'data',
          key: 'test_select',
          action: 'select',
          schema: 'public',
          table: 'users',
        },
      ];

      const result = BulkPermissionBuilder.buildQuery(checks);

      expect(result.query).toContain('cms.has_data_permission');
      expect(result.query).toContain('$1 as key');
      expect(result.query).toContain('$2::cms.system_action');
      expect(result.query).toContain('$3');
      expect(result.query).toContain('$4');
      expect(result.query).not.toContain('$5');
      expect(result.params).toEqual([
        'test_select',
        'select',
        'public',
        'users',
      ]);
    });

    it('should build single data permission check with column', () => {
      const checks: PermissionCheck[] = [
        {
          type: 'data',
          key: 'test_column',
          action: 'select',
          schema: 'public',
          table: 'users',
          column: 'email',
        },
      ];

      const result = BulkPermissionBuilder.buildQuery(checks);

      expect(result.query).toContain('cms.has_data_permission');
      expect(result.query).toContain('$5');
      expect(result.params).toEqual([
        'test_column',
        'select',
        'public',
        'users',
        'email',
      ]);
    });

    it('should build single admin permission check', () => {
      const checks: PermissionCheck[] = [
        {
          type: 'admin',
          key: 'admin_role_insert',
          resource: 'role',
          action: 'insert',
        },
      ];

      const result = BulkPermissionBuilder.buildQuery(checks);

      expect(result.query).toContain('cms.has_admin_permission');
      expect(result.query).toContain('$2::cms.system_resource');
      expect(result.query).toContain('$3::cms.system_action');
      expect(result.params).toEqual(['admin_role_insert', 'role', 'insert']);
    });

    it('should build single role action check', () => {
      const checks: PermissionCheck[] = [
        {
          type: 'role_action',
          key: 'role_update',
          roleId: '123e4567-e89b-12d3-a456-426614174000',
          action: 'update',
        },
      ];

      const result = BulkPermissionBuilder.buildQuery(checks);

      expect(result.query).toContain('cms.can_action_role');
      expect(result.query).toContain('$2::uuid');
      expect(result.params).toEqual([
        'role_update',
        '123e4567-e89b-12d3-a456-426614174000',
        'update',
      ]);
    });

    it('should build multiple checks with UNION ALL', () => {
      const checks: PermissionCheck[] = [
        {
          type: 'data',
          key: 'data_select',
          action: 'select',
          schema: 'public',
          table: 'users',
        },
        {
          type: 'admin',
          key: 'admin_role',
          resource: 'role',
          action: 'insert',
        },
      ];

      const result = BulkPermissionBuilder.buildQuery(checks);

      expect(result.query).toContain('UNION ALL');
      expect(result.query.split('UNION ALL')).toHaveLength(2);
      expect(result.params).toEqual([
        'data_select',
        'select',
        'public',
        'users',
        'admin_role',
        'role',
        'insert',
      ]);
    });

    it('should build permission action check', () => {
      const checks: PermissionCheck[] = [
        {
          type: 'permission_action',
          key: 'permission_update',
          permissionId: '123e4567-e89b-12d3-a456-426614174000',
          action: 'update',
        },
      ];

      const result = BulkPermissionBuilder.buildQuery(checks);

      expect(result.query).toContain('cms.can_modify_permission');
      expect(result.params).toEqual([
        'permission_update',
        '123e4567-e89b-12d3-a456-426614174000',
        'update',
      ]);
    });

    it('should build permission group action check', () => {
      const checks: PermissionCheck[] = [
        {
          type: 'permission_group_action',
          key: 'group_delete',
          groupId: '123e4567-e89b-12d3-a456-426614174000',
          action: 'delete',
        },
      ];

      const result = BulkPermissionBuilder.buildQuery(checks);

      expect(result.query).toContain('cms.can_modify_permission_group');
      expect(result.params).toEqual([
        'group_delete',
        '123e4567-e89b-12d3-a456-426614174000',
        'delete',
      ]);
    });

    it('should build account role modify check', () => {
      const checks: PermissionCheck[] = [
        {
          type: 'account_role_modify',
          key: 'modify_role',
          currentAccountId: '111e1111-e11b-11d1-a111-111111111111',
          targetAccountId: '222e2222-e22b-22d2-a222-222222222222',
          roleId: '333e3333-e33b-33d3-a333-333333333333',
          action: 'insert',
        },
      ];

      const result = BulkPermissionBuilder.buildQuery(checks);

      expect(result.query).toContain('cms.can_modify_account_role');
      expect(result.params).toEqual([
        'modify_role',
        '111e1111-e11b-11d1-a111-111111111111',
        '222e2222-e22b-22d2-a222-222222222222',
        '333e3333-e33b-33d3-a333-333333333333',
        'insert',
      ]);
    });

    it('should build user max role rank check', () => {
      const checks: PermissionCheck[] = [
        {
          type: 'user_max_role_rank',
          key: 'max_rank',
        },
      ];

      const result = BulkPermissionBuilder.buildQuery(checks);

      expect(result.query).toContain('cms.get_user_max_role_rank');
      expect(result.query).toContain("'number' as type");
      expect(result.params).toEqual(['max_rank']);
    });

    it('should build current user account check', () => {
      const checks: PermissionCheck[] = [
        {
          type: 'current_user_account',
          key: 'current_account',
        },
      ];

      const result = BulkPermissionBuilder.buildQuery(checks);

      expect(result.query).toContain('cms.get_current_user_account_id');
      expect(result.query).toContain("'string' as type");
      expect(result.params).toEqual(['current_account']);
    });

    it('should handle parameter indexing correctly for multiple checks', () => {
      const checks: PermissionCheck[] = [
        {
          type: 'data',
          key: 'first',
          action: 'select',
          schema: 'public',
          table: 'table1',
        },
        {
          type: 'admin',
          key: 'second',
          resource: 'role',
          action: 'insert',
        },
        {
          type: 'role_action',
          key: 'third',
          roleId: '123e4567-e89b-12d3-a456-426614174000',
          action: 'update',
        },
      ];

      const result = BulkPermissionBuilder.buildQuery(checks);

      // Verify parameter indices are sequential
      expect(result.query).toContain('$1'); // first key
      expect(result.query).toContain('$5'); // second key (after first 4 params)
      expect(result.query).toContain('$8'); // third key (after first 7 params)

      expect(result.params).toHaveLength(10); // 4 + 3 + 3 = 10 total params
    });

    it('should throw error for unknown check type', () => {
      const checks: PermissionCheck[] = [
        {
          type: 'unknown_type' as any,
          key: 'test',
        } as any,
      ];

      expect(() => BulkPermissionBuilder.buildQuery(checks)).toThrow(
        'Unknown permission check type: unknown_type',
      );
    });
  });

  describe('parseResults', () => {
    it('should parse boolean results', () => {
      const rawResults = [
        { key: 'test1', type: 'boolean' as const, result: true },
        { key: 'test2', type: 'boolean' as const, result: false },
        { key: 'test3', type: 'boolean' as const, result: null },
      ];

      const parsed = BulkPermissionBuilder.parseResults(rawResults);

      expect(parsed).toEqual({
        test1: true,
        test2: false,
        test3: false,
      });
    });

    it('should parse string results', () => {
      const rawResults = [
        {
          key: 'account1',
          type: 'string' as const,
          result: '123e4567-e89b-12d3-a456-426614174000',
        },
        { key: 'account2', type: 'string' as const, result: null },
        { key: 'account3', type: 'string' as const, result: '' },
      ];

      const parsed = BulkPermissionBuilder.parseResults(rawResults);

      expect(parsed).toEqual({
        account1: '123e4567-e89b-12d3-a456-426614174000',
        account2: '',
        account3: '',
      });
    });

    it('should parse number results', () => {
      const rawResults = [
        { key: 'rank1', type: 'number' as const, result: 5 },
        { key: 'rank2', type: 'number' as const, result: 0 },
        { key: 'rank3', type: 'number' as const, result: null },
      ];

      const parsed = BulkPermissionBuilder.parseResults(rawResults);

      expect(parsed).toEqual({
        rank1: 5,
        rank2: 0,
        rank3: 0,
      });
    });

    it('should parse mixed result types', () => {
      const rawResults = [
        { key: 'permission', type: 'boolean' as const, result: true },
        { key: 'account', type: 'string' as const, result: 'test-account' },
        { key: 'rank', type: 'number' as const, result: 3 },
      ];

      const parsed = BulkPermissionBuilder.parseResults(rawResults);

      expect(parsed).toEqual({
        permission: true,
        account: 'test-account',
        rank: 3,
      });
    });
  });

  describe('builders helpers', () => {
    describe('tableCRUD', () => {
      it('should create CRUD permission checks', () => {
        const checks = BulkPermissionBuilder.builders.tableCRUD(
          'users',
          'public',
          'users_table',
        );

        expect(checks).toHaveLength(4);
        expect(checks[0]).toEqual({
          type: 'data',
          key: 'users_select',
          action: 'select',
          schema: 'public',
          table: 'users_table',
        });
        expect(checks[1]).toEqual({
          type: 'data',
          key: 'users_insert',
          action: 'insert',
          schema: 'public',
          table: 'users_table',
        });
        expect(checks[2]).toEqual({
          type: 'data',
          key: 'users_update',
          action: 'update',
          schema: 'public',
          table: 'users_table',
        });
        expect(checks[3]).toEqual({
          type: 'data',
          key: 'users_delete',
          action: 'delete',
          schema: 'public',
          table: 'users_table',
        });
      });
    });

    describe('entityAccess', () => {
      it('should create role access checks', () => {
        const checks =
          BulkPermissionBuilder.builders.entityAccess.role('role-123');

        expect(checks).toHaveLength(2);
        expect(checks[0]).toEqual({
          type: 'role_action',
          key: 'canUpdate',
          roleId: 'role-123',
          action: 'update',
        });
        expect(checks[1]).toEqual({
          type: 'role_action',
          key: 'canDelete',
          roleId: 'role-123',
          action: 'delete',
        });
      });

      it('should create permission access checks', () => {
        const checks =
          BulkPermissionBuilder.builders.entityAccess.permission('perm-123');

        expect(checks).toHaveLength(2);
        expect(checks[0]).toEqual({
          type: 'permission_action',
          key: 'canUpdate',
          permissionId: 'perm-123',
          action: 'update',
        });
      });

      it('should create permission group access checks', () => {
        const checks =
          BulkPermissionBuilder.builders.entityAccess.permissionGroup(
            'group-123',
          );

        expect(checks).toHaveLength(2);
        expect(checks[0]).toEqual({
          type: 'permission_group_action',
          key: 'canUpdate',
          groupId: 'group-123',
          action: 'update',
        });
      });
    });

    describe('adminAccess', () => {
      it('should create admin permission checks', () => {
        const resources = [
          { resource: 'role' as const, action: 'insert' as const },
          { resource: 'permission' as const, action: 'update' as const },
        ];

        const checks = BulkPermissionBuilder.builders.adminAccess(resources);

        expect(checks).toHaveLength(2);
        expect(checks[0]).toEqual({
          type: 'admin',
          key: 'role_insert',
          resource: 'role',
          action: 'insert',
        });
        expect(checks[1]).toEqual({
          type: 'admin',
          key: 'permission_update',
          resource: 'permission',
          action: 'update',
        });
      });
    });
  });
});
