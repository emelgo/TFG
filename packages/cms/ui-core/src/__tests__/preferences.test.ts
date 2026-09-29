/**
 * Pruebas de la lectura de las preferencias del CMS: el JSONB de la base de
 * datos no tiene tipo, así que la interfaz debe tolerar valores inesperados.
 */
import { describe, expect, it } from 'vitest';

import { getCmsPreferences } from '../preferences';

describe('getCmsPreferences', () => {
  it('devuelve el idioma y la zona horaria cuando son cadenas', () => {
    expect(
      getCmsPreferences({ language: 'es-ES', timezone: 'Europe/Madrid' }),
    ).toEqual({ language: 'es-ES', timezone: 'Europe/Madrid' });
  });

  it('ignora cadenas vacías y valores de otro tipo', () => {
    expect(getCmsPreferences({ language: '', timezone: 42 })).toEqual({
      language: undefined,
      timezone: undefined,
    });
  });

  it('tolera un valor que no es un objeto', () => {
    expect(getCmsPreferences(null)).toEqual({});
    expect(getCmsPreferences('en')).toEqual({});
  });
});
