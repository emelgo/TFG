/**
 * Pruebas de la lectura de las preferencias del CMS: el JSONB de la base de
 * datos no tiene tipo, así que la interfaz debe tolerar valores inesperados.
 */
import { describe, expect, it } from 'vitest';

import { getCmsPreferences } from '../preferences';

describe('getCmsPreferences', () => {
  it('devuelve la zona horaria e ignora un idioma antiguo guardado', () => {
    expect(
      getCmsPreferences({ language: 'en-US', timezone: 'Europe/Madrid' }),
    ).toEqual({ timezone: 'Europe/Madrid' });
  });

  it('ignora cadenas vacías y valores de otro tipo', () => {
    expect(getCmsPreferences({ timezone: 42 })).toEqual({
      timezone: undefined,
    });
  });

  it('tolera un valor que no es un objeto', () => {
    expect(getCmsPreferences(null)).toEqual({});
    expect(getCmsPreferences('en')).toEqual({});
  });
});
