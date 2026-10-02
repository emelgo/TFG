import { describe, expect, it } from 'vitest';

import {
  enumMessageKey,
  humanizeEnumValue,
  looksLikeEnumValue,
  resolveEnumLabel,
} from '../enum-labels';
import { registry } from '../messages';

/**
 * Etiquetas de los enumerados (F3b): humanizador por defecto y orden de
 * resolución «columna → traducción → humanizador».
 */
describe('humanizeEnumValue', () => {
  it('convierte snake_case en una frase en mayúscula inicial', () => {
    expect(humanizeEnumValue('in_app')).toBe('In app');
    expect(humanizeEnumValue('incomplete_expired')).toBe('Incomplete expired');
    expect(humanizeEnumValue('PAST_DUE')).toBe('Past due');
    expect(humanizeEnumValue('roles.manage')).toBe('Roles manage');
    expect(humanizeEnumValue('full-time')).toBe('Full time');
  });

  it('deja intactos los valores sin letras', () => {
    expect(humanizeEnumValue('*')).toBe('*');
    expect(humanizeEnumValue('')).toBe('');
  });
});

describe('looksLikeEnumValue', () => {
  it('solo reconoce identificadores snake_case', () => {
    expect(looksLikeEnumValue('past_due')).toBe(true);
    expect(looksLikeEnumValue('in_app')).toBe(true);
    expect(looksLikeEnumValue('pending')).toBe(false);
    expect(looksLikeEnumValue('Ana López')).toBe(false);
    expect(looksLikeEnumValue('2026-01-05')).toBe(false);
  });
});

describe('enumMessageKey', () => {
  it('evita los puntos (anidan claves) y traduce el comodín', () => {
    expect(enumMessageKey('roles.manage')).toBe('roles_manage');
    expect(enumMessageKey('*')).toBe('all');
    expect(enumMessageKey('in_app')).toBe('in_app');
  });
});

describe('resolveEnumLabel', () => {
  const enums = registry.es!.common!['enums'] as Record<
    string,
    Record<string, string>
  >;

  const translate = (key: string) => {
    const [name, value] = key.split('.');
    return enums[name!]?.[value!];
  };

  it('usa primero la etiqueta configurada en la columna', () => {
    expect(
      resolveEnumLabel('draft', {
        enumName: 'blog_post_status',
        overrides: { draft: '  En redacción ' },
        translate,
      }),
    ).toBe('En redacción');
  });

  it('después la traducción explícita del enumerado', () => {
    expect(
      resolveEnumLabel('in_app', {
        enumName: 'notification_channel',
        overrides: { email: 'Correo' },
        translate,
      }),
    ).toBe('En la aplicación');
    expect(
      resolveEnumLabel('roles.manage', {
        enumName: 'app_permissions',
        translate,
      }),
    ).toBe('Gestionar roles');
    expect(
      resolveEnumLabel('*', { enumName: 'system_action', translate }),
    ).toBe('Todas');
  });

  it('y por último el humanizador', () => {
    expect(
      resolveEnumLabel('custom_value', {
        enumName: 'unknown_enum',
        overrides: { custom_value: '' },
        translate,
      }),
    ).toBe('Custom value');
    expect(resolveEnumLabel('in_app')).toBe('In app');
    expect(resolveEnumLabel(null)).toBe('');
  });
});
