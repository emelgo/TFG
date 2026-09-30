/**
 * Tests de la lógica pura de Ajustes > Permisos (F2.7b).
 */
import { describe, expect, it } from 'vitest';

import {
  EMPTY_PERMISSION_FORM,
  PermissionFormSchema,
  RbacSearchSchema,
  buildAssignmentChanges,
  createRoleFormSchema,
  describePermissionTarget,
  filterByQuery,
  getAvailableRanks,
  getRbacErrorKey,
  permissionToFormValues,
  resolveRbacTab,
  toPermissionInput,
} from '../utils/rbac-forms';

describe('search params', () => {
  it('descarta valores no válidos escritos a mano', () => {
    expect(RbacSearchSchema.parse({ tab: 'hacker', q: 'x' })).toEqual({
      tab: undefined,
      q: 'x',
    });
  });

  it('muestra la primera pestaña visible si la pedida no lo es', () => {
    const onlyRoles = { canReadRoles: true, canReadPermissions: false };
    const onlyPermissions = { canReadRoles: false, canReadPermissions: true };

    expect(resolveRbacTab('groups', onlyRoles)).toBe('roles');
    expect(resolveRbacTab(undefined, onlyPermissions)).toBe('groups');
    expect(resolveRbacTab('permissions', onlyPermissions)).toBe('permissions');
  });

  it('filtra sin distinguir mayúsculas', () => {
    const items = [{ name: 'Editor' }, { name: 'Soporte' }];

    expect(filterByQuery(items, 'edit', (item) => [item.name])).toEqual([
      { name: 'Editor' },
    ]);
    expect(filterByQuery(items, '  ', (item) => [item.name])).toHaveLength(2);
  });
});

describe('roles', () => {
  it('solo ofrece rangos libres e inferiores al propio', () => {
    expect(getAvailableRanks({ maxRank: 5, takenRanks: [3, 30, 100] })).toEqual(
      [4, 2, 1, 0],
    );
  });

  it('al editar incluye el rango actual del rol', () => {
    expect(
      getAvailableRanks({ maxRank: 5, takenRanks: [3], currentRank: 3 }),
    ).toEqual([4, 3, 2, 1, 0]);
  });

  it('sin rango propio no ofrece ninguno', () => {
    expect(getAvailableRanks({ maxRank: null, takenRanks: [] })).toEqual([]);
  });

  it('el esquema rechaza un rango igual o superior al propio', () => {
    const schema = createRoleFormSchema(50);

    expect(
      schema.safeParse({ name: 'A', description: '', rank: '50' }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ name: 'A', description: '', rank: '49' }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ name: ' ', description: '', rank: '10' }).success,
    ).toBe(false);
  });
});

describe('formulario de permisos', () => {
  it('exige los campos de la forma elegida', () => {
    const table = PermissionFormSchema.safeParse({
      ...EMPTY_PERMISSION_FORM,
      name: 'P',
      kind: 'table',
    });

    expect(table.success).toBe(false);

    const storage = PermissionFormSchema.safeParse({
      ...EMPTY_PERMISSION_FORM,
      name: 'P',
      kind: 'storage',
      bucketName: 'docs',
      pathPattern: '',
    });

    expect(storage.success).toBe(false);
  });

  it('convierte a la API solo los campos de la forma elegida', () => {
    expect(
      toPermissionInput({
        ...EMPTY_PERMISSION_FORM,
        name: ' Leer productos ',
        kind: 'table',
        schemaName: 'demo',
        tableName: 'products',
        bucketName: 'residuo',
      }),
    ).toEqual({
      name: 'Leer productos',
      description: null,
      action: 'select',
      permissionType: 'data',
      scope: 'table',
      schemaName: 'demo',
      tableName: 'products',
    });

    expect(
      toPermissionInput({
        ...EMPTY_PERMISSION_FORM,
        name: 'Docs',
        kind: 'storage',
        bucketName: ' docs ',
        pathPattern: 'team/*',
        action: '*',
      }),
    ).toMatchObject({
      scope: 'storage',
      bucketName: 'docs',
      pathPattern: 'team/*',
    });
  });

  it('carga un permiso guardado y lo describe', () => {
    const permission = {
      id: 'p',
      name: 'Docs',
      description: null,
      permissionType: 'data' as const,
      systemResource: null,
      scope: 'storage' as const,
      schemaName: null,
      tableName: null,
      columnName: null,
      action: 'select',
      bucketName: 'docs',
      pathPattern: 'team/*',
      isSystem: false,
    };

    expect(permissionToFormValues(permission)).toMatchObject({
      kind: 'storage',
      bucketName: 'docs',
      pathPattern: 'team/*',
    });
    expect(describePermissionTarget(permission)).toBe('docs:team/*');
    expect(
      describePermissionTarget({
        ...permission,
        scope: 'column',
        schemaName: 'demo',
        tableName: 'orders',
        columnName: 'total',
      }),
    ).toBe('demo.orders.total');
  });
});

describe('asignaciones y errores', () => {
  it('solo envía lo que no estaba asignado', () => {
    expect(buildAssignmentChanges(['a'], ['a', 'b', 'b'])).toEqual({
      toAdd: ['b'],
      toRemove: [],
    });
    expect(buildAssignmentChanges(['a'], ['a'])).toBeNull();
  });

  it('elige el mensaje por el código estable de la API', () => {
    expect(
      getRbacErrorKey({ errorCode: 'ROLE_RANK_DENIED', status: 403 }),
    ).toBe('errors.roleRankDenied');
    expect(getRbacErrorKey({ errorCode: 'PERMISSION_NOT_GRANTABLE' })).toBe(
      'errors.notGrantable',
    );
    expect(getRbacErrorKey({ status: 403 })).toBe('errors.accessDenied');
    expect(getRbacErrorKey(new Error('network'))).toBe('errors.generic');
  });
});
