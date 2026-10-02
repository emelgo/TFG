/**
 * Pruebas de la lógica pura de Ajustes del CMS (F2.7a): *search params* de
 * miembros, cálculo del cambio de rol, validación del formulario General y
 * mensajes por código de error.
 */
import { describe, expect, it } from 'vitest';

import {
  GeneralSettingsSchema,
  MembersSearchSchema,
  buildMemberRolesChange,
  getSelectableTimeZones,
  getSettingsErrorKey,
  toMembersListParams,
  withMembersSearch,
} from '../utils';

describe('MembersSearchSchema', () => {
  it('descarta valores manipulados en la URL', () => {
    expect(MembersSearchSchema.parse({ page: '-3', search: 'ana' })).toEqual({
      page: undefined,
      search: 'ana',
    });
    expect(MembersSearchSchema.parse({ page: 'x' }).page).toBeUndefined();
    expect(
      MembersSearchSchema.parse({ search: 'a'.repeat(101) }).search,
    ).toBeUndefined();
  });

  it('traduce la URL a parámetros de la API sin valores vacíos', () => {
    expect(toMembersListParams({ page: 1, search: '' })).toEqual({
      page: undefined,
      search: undefined,
    });
    expect(toMembersListParams({ page: 3, search: 'soporte' })).toEqual({
      page: 3,
      search: 'soporte',
    });
  });

  it('una búsqueda nueva vuelve a la primera página', () => {
    expect(withMembersSearch('  staff ')).toEqual({
      search: 'staff',
      page: undefined,
    });
    expect(withMembersSearch('   ')).toEqual({
      search: undefined,
      page: undefined,
    });
  });
});

describe('buildMemberRolesChange', () => {
  it('no cambia nada si el rol es el mismo', () => {
    expect(buildMemberRolesChange('a', 'a')).toBeNull();
    expect(buildMemberRolesChange(null, null)).toBeNull();
  });

  it('sustituye, asigna o quita el rol', () => {
    expect(buildMemberRolesChange('a', 'b')).toEqual({
      rolesToAdd: ['b'],
      rolesToRemove: ['a'],
    });
    expect(buildMemberRolesChange(null, 'b')).toEqual({
      rolesToAdd: ['b'],
      rolesToRemove: [],
    });
    expect(buildMemberRolesChange('a', null)).toEqual({
      rolesToAdd: [],
      rolesToRemove: ['a'],
    });
  });
});

describe('GeneralSettingsSchema', () => {
  it('acepta una zona horaria válida', () => {
    expect(
      GeneralSettingsSchema.safeParse({ timezone: 'Europe/Madrid' }).success,
    ).toBe(true);
  });

  it('rechaza una zona horaria desconocida con una clave i18n', () => {
    const result = GeneralSettingsSchema.safeParse({
      timezone: 'Nowhere/Land',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'cms.settings.general.errors.invalidTimezone',
    );
  });
});

describe('getSelectableTimeZones', () => {
  it('pone UTC en primer lugar e incluye la zona actual', () => {
    const zones = getSelectableTimeZones('Europe/Madrid');

    expect(zones[0]).toBe('UTC');
    expect(zones).toContain('Europe/Madrid');
    expect(new Set(zones).size).toBe(zones.length);
  });
});

describe('getSettingsErrorKey', () => {
  it('elige el mensaje por el código estable', () => {
    expect(
      getSettingsErrorKey({ errorCode: 'MEMBER_SELF_ACTION' }, 'fallback'),
    ).toBe('errors.selfAction');
    expect(
      getSettingsErrorKey(
        { errorCode: 'SETTINGS_MFA_DISABLE_REQUIRES_ROOT' },
        'fallback',
      ),
    ).toBe('errors.mfaDisableRequiresRoot');
  });

  it('usa el genérico sin código y «sin permiso» con un 403 sin código', () => {
    expect(getSettingsErrorKey(new Error('x'), 'fallback')).toBe('fallback');
    expect(getSettingsErrorKey({ status: 403 }, 'fallback')).toBe(
      'errors.permissionDenied',
    );
  });
});
