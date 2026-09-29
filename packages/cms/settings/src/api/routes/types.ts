import { z } from 'zod';

// Roles
export const CreateRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  rank: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  rank: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateRoleSchemaType = z.infer<typeof CreateRoleSchema>;
export type UpdateRoleSchemaType = z.infer<typeof UpdateRoleSchema>;

// Permissions
export const CreateSystemPermissionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permissionType: z.enum(['system']),
  systemResource: z.enum([
    'account',
    'role',
    'permission',
    'log',
    'table',
    'auth_user',
  ]),
  action: z.enum(['select', 'update', 'delete', 'insert', '*']),
  constraints: z.record(z.any(), z.any()).nullable().optional(),
  conditions: z.record(z.any(), z.any()).nullable().optional(),
  metadata: z.record(z.any(), z.unknown()).optional(),
});

const CreateDataPermissionSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    permissionType: z.enum(['data']),
    scope: z.enum(['table', 'column', 'storage']).optional(),
    schemaName: z.string().optional(),
    tableName: z.string().optional(),
    columnName: z.string().optional(),
    action: z.enum(['select', 'update', 'delete', 'insert', '*']),
    constraints: z.record(z.any(), z.any()).nullable().optional(),
    conditions: z.record(z.any(), z.any()).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (data) => {
      if (data.scope === 'storage') {
        const metadata = data.metadata as Record<string, unknown>;

        return metadata['bucket_name'] && metadata['path_pattern'];
      }

      return true;
    },
    {
      message: 'Bucket and path pattern are required when scope is storage',
    },
  );

export const CreatePermissionSchema = z.union([
  CreateDataPermissionSchema,
  CreateSystemPermissionSchema,
]);

export const UpdatePermissionSchema = z.union([
  CreateDataPermissionSchema,
  CreateSystemPermissionSchema,
]);

export type CreatePermissionSchemaType = z.infer<typeof CreatePermissionSchema>;

export type UpdatePermissionSchemaType = z.infer<typeof UpdatePermissionSchema>;

// Role-Permission assignments
export const AssignPermissionToRoleSchema = z.object({
  permissionId: z.string(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  conditions: z.record(z.any(), z.any()).optional(),
});

export type AssignPermissionToRoleSchemaType = z.infer<
  typeof AssignPermissionToRoleSchema
>;

// Define the request schema for updating a member's role
export const UpdateMemberRoleSchema = z.object({
  accountId: z.string().uuid(),
  roleId: z.string().uuid(),
});

// Batch update schema for role permissions
export const BatchUpdateRolePermissionsSchema = z.object({
  toAdd: z.array(z.string()),
  toRemove: z.array(z.string()),
});

// Batch update schema for role permission groups
export const BatchUpdateRolePermissionGroupsSchema = z.object({
  toAdd: z.array(z.string()),
  toRemove: z.array(z.string()),
});
