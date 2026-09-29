import { z } from 'zod';

/**
 * Schema for creating a permission group
 */
export const createPermissionGroupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().default(''),
});

export type CreatePermissionGroupSchemaType = z.infer<
  typeof createPermissionGroupSchema
>;

/**
 * Schema for updating a permission group
 */
export const updatePermissionGroupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().default(''),
});

export type UpdatePermissionGroupSchemaType = z.infer<
  typeof updatePermissionGroupSchema
>;

/**
 * Schema for batch updating permission group permissions
 */
export const batchUpdateGroupPermissionsSchema = z.object({
  toAdd: z.array(z.string().uuid()),
  toRemove: z.array(z.string().uuid()),
});

export type BatchUpdateGroupPermissionsSchemaType = z.infer<
  typeof batchUpdateGroupPermissionsSchema
>;
