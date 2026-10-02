/**
 * Tests de los esquemas Zod de Ajustes > Permisos (F2.7b): estrictos, sin
 * `metadata` libre y con *bucket* y patrón de almacenamiento explícitos.
 */
import { describe, expect, it } from 'vitest';

import {
  AssignmentChangesSchema,
  CreateRoleSchema,
  PermissionInputSchema,
  UpdateRoleSchema,
  toPermissionRow,
} from '../lib/rbac-schemas';

const ID = '11111111-1111-4111-8111-111111111111';

describe('CreateRoleSchema', () => {
  it('acepta nombre, descripción y rango', () => {
    expect(
      CreateRoleSchema.parse({ name: ' Editor ', description: '', rank: 40 }),
    ).toEqual({ name: 'Editor', description: null, rank: 40 });
  });

  it('rechaza metadata (marcas de sistema) y campos desconocidos', () => {
    expect(
      CreateRoleSchema.safeParse({
        name: 'X',
        rank: 1,
        metadata: { system_role: 'root' },
      }).success,
    ).toBe(false);
  });

  it('rechaza rangos fuera de 0–100 o no enteros', () => {
    expect(CreateRoleSchema.safeParse({ name: 'X', rank: 101 }).success).toBe(
      false,
    );
    expect(CreateRoleSchema.safeParse({ name: 'X', rank: 1.5 }).success).toBe(
      false,
    );
  });

  it('la edición exige al menos un campo', () => {
    expect(UpdateRoleSchema.safeParse({}).success).toBe(false);
    expect(UpdateRoleSchema.safeParse({ rank: 5 }).success).toBe(true);
  });
});

describe('AssignmentChangesSchema', () => {
  it('exige algún cambio y ids UUID', () => {
    expect(
      AssignmentChangesSchema.safeParse({ toAdd: [], toRemove: [] }).success,
    ).toBe(false);
    expect(
      AssignmentChangesSchema.safeParse({ toAdd: ['x'], toRemove: [] }).success,
    ).toBe(false);
  });

  it('no admite el mismo id en las dos listas', () => {
    expect(
      AssignmentChangesSchema.safeParse({ toAdd: [ID], toRemove: [ID] })
        .success,
    ).toBe(false);
  });
});

describe('PermissionInputSchema', () => {
  it('permiso de sistema', () => {
    const input = PermissionInputSchema.parse({
      name: 'Leer auditoría',
      permissionType: 'system',
      systemResource: 'log',
      action: 'select',
    });

    expect(toPermissionRow(input)).toMatchObject({
      permissionType: 'system',
      systemResource: 'log',
      scope: null,
      schemaName: null,
      metadata: {},
    });
  });

  it('permiso de tabla con comodín explícito', () => {
    const input = PermissionInputSchema.parse({
      name: 'Todo demo',
      permissionType: 'data',
      scope: 'table',
      schemaName: 'demo',
      tableName: '*',
      action: 'select',
    });

    expect(toPermissionRow(input)).toMatchObject({
      scope: 'table',
      schemaName: 'demo',
      tableName: '*',
      columnName: null,
      systemResource: null,
    });
  });

  it('rechaza identificadores que no son SQL', () => {
    expect(
      PermissionInputSchema.safeParse({
        name: 'X',
        permissionType: 'data',
        scope: 'table',
        schemaName: 'demo; drop table x',
        tableName: 'products',
        action: 'select',
      }).success,
    ).toBe(false);
  });

  it('almacenamiento: construye metadata solo con bucket y patrón', () => {
    const input = PermissionInputSchema.parse({
      name: 'Facturas',
      permissionType: 'data',
      scope: 'storage',
      bucketName: 'invoices',
      pathPattern: '{{account_id}}/*',
      action: 'select',
    });

    expect(toPermissionRow(input).metadata).toEqual({
      bucket_name: 'invoices',
      path_pattern: '{{account_id}}/*',
    });
  });

  it('almacenamiento: bucket y patrón vacíos ya no son comodines', () => {
    expect(
      PermissionInputSchema.safeParse({
        name: 'X',
        permissionType: 'data',
        scope: 'storage',
        bucketName: '',
        pathPattern: '*',
        action: 'select',
      }).success,
    ).toBe(false);
    expect(
      PermissionInputSchema.safeParse({
        name: 'X',
        permissionType: 'data',
        scope: 'storage',
        bucketName: 'docs',
        action: 'select',
      }).success,
    ).toBe(false);
  });

  it('rechaza metadata libre y mezclas de campos', () => {
    expect(
      PermissionInputSchema.safeParse({
        name: 'X',
        permissionType: 'system',
        systemResource: 'role',
        action: '*',
        metadata: { system_permission: 'root' },
      }).success,
    ).toBe(false);
    expect(
      PermissionInputSchema.safeParse({
        name: 'X',
        permissionType: 'system',
        systemResource: 'role',
        schemaName: 'public',
        action: '*',
      }).success,
    ).toBe(false);
  });
});
