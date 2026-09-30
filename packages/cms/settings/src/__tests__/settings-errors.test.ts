/**
 * Pruebas de la traducción de errores de los ajustes del CMS (F2.7a): los
 * códigos de las funciones SQL y los SQLSTATE se convierten en códigos
 * estables sin exponer el texto interno.
 */
import { describe, expect, it } from 'vitest';

import { escapeLike } from '../api/services/members.service';
import {
  SettingsError,
  classifySettingsError,
  fromMemberRolesDbError,
  fromMfaConfigurationDbError,
  fromSetAccountActiveCode,
} from '../api/utils/settings-errors';

function pgError(code: string, message = 'boom') {
  return Object.assign(new Error(message), { code });
}

describe('classifySettingsError', () => {
  it('usa el código del error controlado, aunque venga envuelto', () => {
    const wrapped = new Error('Error in Drizzle transaction', {
      cause: new SettingsError('MEMBER_SELF_ACTION', 'detalle interno'),
    });

    expect(classifySettingsError(wrapped)).toEqual({
      status: 403,
      errorCode: 'MEMBER_SELF_ACTION',
      message: 'You cannot change your own roles or status',
    });
  });

  it('convierte un error desconocido en el 500 genérico indicado', () => {
    const result = classifySettingsError(
      new Error('relation "cms.secret" does not exist'),
      'MEMBER_ACTION_FAILED',
    );

    expect(result.status).toBe(500);
    expect(result.errorCode).toBe('MEMBER_ACTION_FAILED');
    expect(result.message).not.toContain('cms.secret');
  });
});

describe('fromSetAccountActiveCode', () => {
  it.each([
    ['SELF_ACTION', 'MEMBER_SELF_ACTION'],
    ['PROTECTED', 'MEMBER_PROTECTED'],
    ['PERMISSION_DENIED', 'MEMBER_PERMISSION_DENIED'],
    ['MFA_REQUIRED', 'MEMBER_PERMISSION_DENIED'],
    ['NOT_FOUND', 'MEMBER_NOT_FOUND'],
    ['INVALID_ARGUMENTS', 'MEMBER_INVALID_DATA'],
    ['something else', 'MEMBER_ACTION_FAILED'],
    [undefined, 'MEMBER_ACTION_FAILED'],
  ])('%s → %s', (code, expected) => {
    expect(fromSetAccountActiveCode(code).code).toBe(expected);
  });
});

describe('fromMfaConfigurationDbError', () => {
  it('reconoce la guardia de requires_mfa', () => {
    const error = new Error('wrapped', {
      cause: pgError('42501', 'MFA_DISABLE_REQUIRES_ROOT_AAL2'),
    });

    expect(fromMfaConfigurationDbError(error)?.code).toBe(
      'SETTINGS_MFA_DISABLE_REQUIRES_ROOT',
    );
  });

  it('trata otro 42501 como falta de permiso y el resto como desconocido', () => {
    expect(fromMfaConfigurationDbError(pgError('42501'))?.code).toBe(
      'SETTINGS_PERMISSION_DENIED',
    );
    expect(fromMfaConfigurationDbError(pgError('XX000'))).toBeNull();
  });
});

describe('fromMemberRolesDbError', () => {
  it.each([
    ['42501', 'MEMBER_RANK_DENIED'],
    ['23514', 'MEMBER_INACTIVE'],
    ['23505', 'MEMBER_INVALID_DATA'],
    ['23503', 'MEMBER_INVALID_DATA'],
  ])('%s → %s', (code, expected) => {
    expect(fromMemberRolesDbError(pgError(code))?.code).toBe(expected);
  });

  it('devuelve null para un error sin SQLSTATE conocido', () => {
    expect(fromMemberRolesDbError(new Error('x'))).toBeNull();
  });
});

describe('escapeLike', () => {
  it('escapa los comodines de LIKE', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
    expect(escapeLike('ana')).toBe('ana');
  });
});
