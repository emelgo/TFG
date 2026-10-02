/**
 * Tests de la traducción de errores de Ajustes > Permisos (F2.7b): ningún
 * texto de PostgreSQL llega al cliente y cada rechazo de la base de datos
 * se convierte en un código estable.
 */
import { describe, expect, it } from 'vitest';

import {
  RbacError,
  classifyRbacError,
  findRbacError,
  fromRbacDbError,
} from '../lib/rbac-errors';

/** Imita un error de `postgres.js` envuelto por el cliente Drizzle. */
function wrapped(pg: Record<string, unknown>) {
  const inner = Object.assign(new Error(String(pg['message'] ?? 'pg')), pg);

  return new Error('Failed query', { cause: inner });
}

describe('classifyRbacError', () => {
  it('un error desconocido es un 500 genérico sin el texto original', () => {
    const result = classifyRbacError(
      new Error('relation "cms.roles" violates something secret'),
    );

    expect(result.status).toBe(500);
    expect(result.errorCode).toBe('PERMISSION_ACTION_FAILED');
    expect(result.message).not.toContain('cms.roles');
  });

  it('encuentra el RbacError dentro de la cadena de causas (B-29)', () => {
    const error = new Error('Transaction failed', {
      cause: new RbacError('ROLE_RANK_DENIED', 'detail'),
    });

    expect(findRbacError(error)?.code).toBe('ROLE_RANK_DENIED');
    expect(classifyRbacError(error)).toMatchObject({
      status: 403,
      errorCode: 'ROLE_RANK_DENIED',
    });
  });
});

describe('fromRbacDbError', () => {
  it('traduce la guardia de sistema según el objeto', () => {
    const error = wrapped({
      code: '42501',
      message: 'SYSTEM_RBAC_OBJECT_PROTECTED',
    });

    expect(fromRbacDbError(error, 'role')?.code).toBe('ROLE_SYSTEM_PROTECTED');
    expect(fromRbacDbError(error, 'group')?.code).toBe(
      'GROUP_SYSTEM_PROTECTED',
    );
    expect(fromRbacDbError(error, 'permission')?.code).toBe(
      'PERMISSION_SYSTEM_PROTECTED',
    );
  });

  it('traduce el trigger de reshape a PERMISSION_NOT_GRANTABLE', () => {
    const error = wrapped({
      code: '42501',
      message:
        'insufficient_privilege: cannot reshape a permission into a capability you do not hold',
    });

    expect(fromRbacDbError(error, 'permission')?.code).toBe(
      'PERMISSION_NOT_GRANTABLE',
    );
  });

  it('cualquier otro 42501 (RLS) es PERMISSION_ACCESS_DENIED', () => {
    const error = wrapped({
      code: '42501',
      message: 'new row violates row-level security policy for table "roles"',
    });

    expect(fromRbacDbError(error, 'role')?.code).toBe(
      'PERMISSION_ACCESS_DENIED',
    );
  });

  it('distingue nombre y rango repetidos por la restricción', () => {
    expect(
      fromRbacDbError(
        wrapped({ code: '23505', constraint_name: 'roles_rank_unique' }),
        'role',
      )?.code,
    ).toBe('ROLE_RANK_TAKEN');
    expect(
      fromRbacDbError(
        wrapped({ code: '23505', constraint_name: 'roles_name_key' }),
        'role',
      )?.code,
    ).toBe('ROLE_NAME_TAKEN');
    expect(
      fromRbacDbError(
        wrapped({
          code: '23505',
          constraint_name: 'permission_groups_name_key',
        }),
        'group',
      )?.code,
    ).toBe('GROUP_NAME_TAKEN');
    expect(
      fromRbacDbError(
        wrapped({ code: '23505', constraint_name: 'permissions_name_unique' }),
        'permission',
      )?.code,
    ).toBe('PERMISSION_NAME_TAKEN');
  });

  it('traduce el trigger de rango de roles y las excepciones de grupos', () => {
    expect(
      fromRbacDbError(
        wrapped({
          code: 'P0001',
          message:
            'Cannot modify a role with a rank higher than or equal to your maximum role rank (80)',
        }),
        'role',
      )?.code,
    ).toBe('ROLE_RANK_DENIED');
    expect(
      fromRbacDbError(
        wrapped({
          code: 'P0001',
          message:
            'This user cannot modify this permission group because it is used by a role with a higher rank than their own.',
        }),
        'group',
      )?.code,
    ).toBe('GROUP_RANK_DENIED');
  });

  it('las violaciones de restricciones son datos no válidos', () => {
    expect(
      fromRbacDbError(wrapped({ code: '23514' }), 'permission')?.code,
    ).toBe('PERMISSION_INVALID_DATA');
  });

  it('no reinterpreta un RbacError (su `code` no es un SQLSTATE)', () => {
    expect(
      fromRbacDbError(new RbacError('ROLE_NOT_FOUND', 'x'), 'role'),
    ).toBeNull();
  });

  it('devuelve null para errores que no son de PostgreSQL', () => {
    expect(fromRbacDbError(new Error('boom'), 'role')).toBeNull();
  });
});
