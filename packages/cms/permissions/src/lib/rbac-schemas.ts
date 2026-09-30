/**
 * Esquemas Zod de la API de Ajustes > Permisos (F2.7b).
 *
 * Todos son estrictos (`.strict()`): un campo desconocido responde 400 en
 * lugar de ignorarse. En concreto, ninguna petición acepta `metadata`, que
 * es donde viven las marcas de los objetos de sistema del super-admin
 * (`system_role`, `system_group`, `system_permission`) y la capacidad de
 * los permisos de almacenamiento: el servidor la construye a partir de
 * campos explícitos (`toPermissionRow`). Los formatos (identificadores,
 * *buckets*, patrones) son los de `@pymekit/cms-shared/rbac`, compartidos
 * con los formularios de la interfaz.
 *
 * [TFG] RNF-02 · ADR-015. Tests en `__tests__/rbac-schemas.test.ts`.
 */
import * as z from 'zod';

import {
  RBAC_ACTIONS,
  RBAC_LIMITS,
  RBAC_MAX_RANK,
  RBAC_SYSTEM_RESOURCES,
  type RbacSystemResource,
  isRbacBucketName,
  isRbacIdentifier,
  isRbacPathPattern,
} from '@pymekit/cms-shared/rbac';

export const IdParamsSchema = z.object({ id: z.string().uuid() }).strict();

const trimmedName = (max: number) => z.string().trim().min(1).max(max);

/** Descripción opcional; una cadena vacía se guarda como `null`. */
const description = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

const rank = z.number().int().min(0).max(RBAC_MAX_RANK);

export const CreateRoleSchema = z
  .object({
    name: trimmedName(RBAC_LIMITS.roleName),
    description: description(RBAC_LIMITS.roleDescription),
    rank,
  })
  .strict();

export const UpdateRoleSchema = z
  .object({
    name: trimmedName(RBAC_LIMITS.roleName).optional(),
    description: description(RBAC_LIMITS.roleDescription).optional(),
    rank: rank.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export const CreateGroupSchema = z
  .object({
    name: trimmedName(RBAC_LIMITS.groupName),
    description: description(RBAC_LIMITS.groupDescription),
  })
  .strict();

export const UpdateGroupSchema = z
  .object({
    name: trimmedName(RBAC_LIMITS.groupName).optional(),
    description: description(RBAC_LIMITS.groupDescription).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

/**
 * Cambios de asignación (grupos de un rol, permisos de un rol o de un
 * grupo): ids que añadir y que quitar, sin repetir un id en las dos listas
 * y con un límite por petición.
 */
export const AssignmentChangesSchema = z
  .object({
    toAdd: z.array(z.string().uuid()).max(RBAC_LIMITS.assignmentBatch),
    toRemove: z.array(z.string().uuid()).max(RBAC_LIMITS.assignmentBatch),
  })
  .strict()
  .refine((value) => value.toAdd.length + value.toRemove.length > 0)
  .refine((value) => !value.toAdd.some((id) => value.toRemove.includes(id)));

const identifier = z.string().trim().refine(isRbacIdentifier);

const permissionBase = {
  name: trimmedName(RBAC_LIMITS.permissionName),
  description: description(RBAC_LIMITS.permissionDescription),
  action: z.enum(RBAC_ACTIONS),
};

const SystemPermissionSchema = z
  .object({
    ...permissionBase,
    permissionType: z.literal('system'),
    systemResource: z.enum(RBAC_SYSTEM_RESOURCES),
  })
  .strict();

const TablePermissionSchema = z
  .object({
    ...permissionBase,
    permissionType: z.literal('data'),
    scope: z.literal('table'),
    schemaName: identifier,
    tableName: identifier,
  })
  .strict();

const ColumnPermissionSchema = z
  .object({
    ...permissionBase,
    permissionType: z.literal('data'),
    scope: z.literal('column'),
    schemaName: identifier,
    tableName: identifier,
    columnName: identifier,
  })
  .strict();

/**
 * Permiso de almacenamiento: *bucket* y patrón SIEMPRE explícitos (para dar
 * acceso a todo hay que escribir `*`), ADR-015 · F2.7b.
 */
const StoragePermissionSchema = z
  .object({
    ...permissionBase,
    permissionType: z.literal('data'),
    scope: z.literal('storage'),
    bucketName: z.string().trim().refine(isRbacBucketName),
    pathPattern: z.string().trim().refine(isRbacPathPattern),
  })
  .strict();

/** Cuerpo de crear y de editar un permiso (la edición lo sustituye). */
export const PermissionInputSchema = z.union([
  SystemPermissionSchema,
  TablePermissionSchema,
  ColumnPermissionSchema,
  StoragePermissionSchema,
]);

export type PermissionInput = z.infer<typeof PermissionInputSchema>;

/**
 * Convierte la entrada validada en las columnas de `cms.permissions`.
 *
 * Deja a `null` las columnas que no corresponden a la forma elegida (la
 * restricción `valid_permission_type` lo exige) y construye `metadata`
 * solo con la capacidad de almacenamiento: nunca con valores del cliente
 * sin validar ni con marcas de sistema.
 */
export function toPermissionRow(input: PermissionInput) {
  const base = {
    name: input.name,
    description: input.description,
    permissionType: input.permissionType,
    action: input.action,
    systemResource: null as RbacSystemResource | null,
    scope: null as 'table' | 'column' | 'storage' | null,
    schemaName: null as string | null,
    tableName: null as string | null,
    columnName: null as string | null,
    metadata: {} as Record<string, string>,
  };

  if (input.permissionType === 'system') {
    return { ...base, systemResource: input.systemResource };
  }

  if (input.scope === 'storage') {
    return {
      ...base,
      scope: input.scope,
      metadata: {
        bucket_name: input.bucketName,
        path_pattern: input.pathPattern,
      },
    };
  }

  return {
    ...base,
    scope: input.scope,
    schemaName: input.schemaName,
    tableName: input.tableName,
    columnName: input.scope === 'column' ? input.columnName : null,
  };
}

export type PermissionRow = ReturnType<typeof toPermissionRow>;
