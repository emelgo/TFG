/**
 * Pruebas de la lógica de cliente del explorador de usuarios: *search params*
 * del listado, usuarios afectados por cada acción múltiple, esquemas de los
 * formularios y mensajes por código de error.
 */
import { describe, expect, it } from 'vitest';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

import {
  CreateUserSchema,
  UsersSearchSchema,
  createConfirmationSchema,
  getBatchActionTargets,
  getUserErrorKey,
  isUserActionable,
  toUsersListParams,
  withUsersSearch,
} from '../utils';

const user = (overrides: Partial<Parameters<typeof isUserActionable>[0]>) => ({
  id: 'u',
  is_banned: false,
  is_self: false,
  is_super_admin: false,
  has_cms_access: false,
  ...overrides,
});

describe('UsersSearchSchema', () => {
  it('descarta valores no válidos en lugar de fallar', () => {
    expect(UsersSearchSchema.parse({ page: 'abc', search: 42 })).toEqual({
      page: undefined,
      search: undefined,
    });
    expect(UsersSearchSchema.parse({ page: '3', search: ' ana ' })).toEqual({
      page: 3,
      search: 'ana',
    });
  });

  it('omite la primera página y la búsqueda vacía al llamar a la API', () => {
    expect(toUsersListParams({ page: 1, search: '' })).toEqual({
      page: undefined,
      search: undefined,
    });
    expect(toUsersListParams({ page: 2, search: 'x' })).toEqual({
      page: 2,
      search: 'x',
    });
  });

  it('buscar vuelve a la primera página', () => {
    expect(withUsersSearch('  ana ')).toEqual({
      search: 'ana',
      page: undefined,
    });
    expect(withUsersSearch('')).toEqual({ search: undefined, page: undefined });
  });
});

describe('usuarios afectados por las acciones múltiples', () => {
  const normal = user({ id: 'normal' });
  const banned = user({ id: 'banned', is_banned: true });
  const self = user({ id: 'self', is_self: true });
  const superAdmin = user({ id: 'root', is_super_admin: true });
  const staff = user({ id: 'staff', has_cms_access: true });
  const all = [normal, banned, self, superAdmin, staff];

  it('nunca incluye usuarios protegidos', () => {
    for (const action of ['ban', 'unban', 'resetPassword', 'delete'] as const) {
      const ids = getBatchActionTargets(all, action).map((item) => item.id);

      expect(ids).not.toContain('self');
      expect(ids).not.toContain('root');
      expect(ids).not.toContain('staff');
    }
  });

  it('bloquear solo afecta a los activos y desbloquear a los bloqueados', () => {
    expect(getBatchActionTargets(all, 'ban').map((u) => u.id)).toEqual([
      'normal',
    ]);
    expect(getBatchActionTargets(all, 'unban').map((u) => u.id)).toEqual([
      'banned',
    ]);
    expect(getBatchActionTargets(all, 'delete').map((u) => u.id)).toEqual([
      'normal',
      'banned',
    ]);
  });
});

describe('esquemas de formularios', () => {
  it('exige una contraseña robusta al crear', () => {
    const weak = CreateUserSchema.safeParse({
      email: 'a@b.test',
      password: 'password',
      autoConfirm: true,
    });

    expect(weak.success).toBe(false);
    expect(
      CreateUserSchema.safeParse({
        email: 'a@b.test',
        password: 'Passw0rdOk',
        autoConfirm: true,
      }).success,
    ).toBe(true);
  });

  it('la confirmación escrita exige la palabra exacta', () => {
    const schema = createConfirmationSchema('ELIMINAR');

    expect(schema.safeParse({ confirmText: 'delete' }).success).toBe(false);
    expect(schema.safeParse({ confirmText: 'ELIMINAR' }).success).toBe(true);
  });
});

describe('getUserErrorKey', () => {
  it('elige el mensaje por el código y nunca por el texto', () => {
    expect(
      getUserErrorKey(
        {
          errorCode: CMS_API_ERROR_CODES.AUTH_USER_PROTECTED,
          message: 'x',
        },
        'fallback',
      ),
    ).toBe('errors.protected');
    expect(getUserErrorKey({ status: 403 }, 'fallback')).toBe(
      'errors.permissionDenied',
    );
    expect(getUserErrorKey(new Error('boom'), 'fallback')).toBe('fallback');
  });
});
