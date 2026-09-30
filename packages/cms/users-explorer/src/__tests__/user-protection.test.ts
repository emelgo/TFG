/**
 * Pruebas de las reglas que protegen a los usuarios frente a las acciones
 * del explorador de usuarios del CMS, y de la traducción de sus errores.
 *
 * Son la barrera que se ejecuta antes de llamar a la API de administración de
 * Auth con la clave de servicio: si fallaran, un miembro del personal podría
 * bloquear o borrar al super-admin, o actuar sobre sí mismo.
 */
import { describe, expect, it } from 'vitest';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

import {
  getAdminAccessChange,
  getUserProtection,
  hasCmsAccessClaim,
  isPlatformSuperAdmin,
} from '../api/utils/user-protection';
import {
  UsersExplorerError,
  classifyUsersError,
  fromAdminAccessFailure,
  fromAuthAdminError,
  protectionError,
} from '../api/utils/users-errors';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';

describe('getUserProtection', () => {
  it('nadie puede actuar sobre sí mismo', () => {
    expect(
      getUserProtection({
        actorId: ACTOR,
        targetId: ACTOR,
        targetAppMetadata: {},
      }),
    ).toBe('self');
  });

  it('protege al super-admin de la plataforma aunque no tenga el claim del CMS', () => {
    expect(
      getUserProtection({
        actorId: ACTOR,
        targetId: TARGET,
        targetAppMetadata: { role: 'super-admin', cms_access: 'false' },
      }),
    ).toBe('super_admin');
  });

  it('protege al personal del CMS con acceso', () => {
    expect(
      getUserProtection({
        actorId: ACTOR,
        targetId: TARGET,
        targetAppMetadata: { cms_access: 'true' },
      }),
    ).toBe('cms_staff');
  });

  it('deja actuar sobre un usuario normal o sin metadatos', () => {
    for (const metadata of [{}, null, undefined, { cms_access: 'false' }]) {
      expect(
        getUserProtection({
          actorId: ACTOR,
          targetId: TARGET,
          targetAppMetadata: metadata,
        }),
      ).toBeNull();
    }
  });

  it('solo reconoce los valores exactos de los claims', () => {
    expect(isPlatformSuperAdmin({ role: 'Super-Admin' })).toBe(false);
    expect(isPlatformSuperAdmin({ role: 'super-admin' })).toBe(true);
    expect(hasCmsAccessClaim({ cms_access: true })).toBe(false);
    expect(hasCmsAccessClaim({ cms_access: 'true' })).toBe(true);
  });
});

describe('getAdminAccessChange', () => {
  it('ofrece conceder a un usuario normal y retirar al personal', () => {
    expect(
      getAdminAccessChange({
        actorId: ACTOR,
        targetId: TARGET,
        targetAppMetadata: {},
      }),
    ).toBe('grant');
    expect(
      getAdminAccessChange({
        actorId: ACTOR,
        targetId: TARGET,
        targetAppMetadata: { cms_access: 'true' },
      }),
    ).toBe('revoke');
  });

  it('nunca ofrece cambiar el acceso de un super-admin ni el propio', () => {
    expect(
      getAdminAccessChange({
        actorId: ACTOR,
        targetId: TARGET,
        targetAppMetadata: { role: 'super-admin', cms_access: 'true' },
      }),
    ).toBeNull();
    expect(
      getAdminAccessChange({
        actorId: ACTOR,
        targetId: ACTOR,
        targetAppMetadata: {},
      }),
    ).toBeNull();
  });
});

describe('errores del explorador de usuarios', () => {
  it('traduce la protección a 403 con su código', () => {
    expect(classifyUsersError(protectionError('self'))).toMatchObject({
      status: 403,
      errorCode: CMS_API_ERROR_CODES.AUTH_USER_SELF_ACTION,
    });
    expect(classifyUsersError(protectionError('super_admin'))).toMatchObject({
      status: 403,
      errorCode: CMS_API_ERROR_CODES.AUTH_USER_PROTECTED,
    });
  });

  it('un error desconocido es un 500 sin el texto original', () => {
    const result = classifyUsersError(
      new Error('duplicate key value violates unique constraint "users_pkey"'),
    );

    expect(result.status).toBe(500);
    expect(result.message).not.toContain('users_pkey');
  });

  it('traduce los errores de la API de administración de Auth', () => {
    expect(
      fromAuthAdminError({ code: 'email_exists', status: 422 }, 'create').code,
    ).toBe(CMS_API_ERROR_CODES.AUTH_USER_ALREADY_EXISTS);
    expect(
      fromAuthAdminError({ code: 'weak_password', status: 422 }, 'create').code,
    ).toBe(CMS_API_ERROR_CODES.AUTH_USER_INVALID_DATA);
    expect(fromAuthAdminError({ status: 404 }, 'get').code).toBe(
      CMS_API_ERROR_CODES.AUTH_USER_NOT_FOUND,
    );
    expect(fromAuthAdminError({ status: 500 }, 'get').code).toBe(
      CMS_API_ERROR_CODES.AUTH_USER_ACTION_FAILED,
    );
  });

  it('traduce los rechazos de las funciones de acceso al CMS sin filtrar SQLERRM', () => {
    expect(
      fromAdminAccessFailure(
        'Cannot revoke admin access from users with equal or higher role rank',
      ).code,
    ).toBe(CMS_API_ERROR_CODES.AUTH_USER_PERMISSION_DENIED);
    expect(
      fromAdminAccessFailure('Insufficient permissions to grant admin access')
        .code,
    ).toBe(CMS_API_ERROR_CODES.AUTH_USER_PERMISSION_DENIED);
    expect(fromAdminAccessFailure('User not found').code).toBe(
      CMS_API_ERROR_CODES.AUTH_USER_NOT_FOUND,
    );

    const internal = fromAdminAccessFailure(
      'relation "cms.accounts" does not exist',
    );

    expect(internal.code).toBe(CMS_API_ERROR_CODES.AUTH_USER_ACTION_FAILED);
    expect(classifyUsersError(internal).message).not.toContain('cms.accounts');
    expect(internal).toBeInstanceOf(UsersExplorerError);
  });
});

describe('antiguo personal del CMS', () => {
  it('protege una cuenta del CMS de rango igual o superior aunque ya no tenga acceso', () => {
    expect(
      getUserProtection({
        actorId: ACTOR,
        targetId: TARGET,
        targetAppMetadata: { cms_access: 'false' },
        targetCmsAccount: { outranked: false },
      }),
    ).toBe('cms_rank');
  });

  it('deja actuar si el operador la supera en rango', () => {
    expect(
      getUserProtection({
        actorId: ACTOR,
        targetId: TARGET,
        targetAppMetadata: { cms_access: 'false' },
        targetCmsAccount: { outranked: true },
      }),
    ).toBeNull();
  });
});
