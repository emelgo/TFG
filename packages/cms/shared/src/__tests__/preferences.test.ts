/**
 * Pruebas de las reglas de preferencias del CMS (zona horaria, idioma y
 * combinación con lo guardado). F2.7a.
 */
import { describe, expect, it } from 'vitest';

import {
  isValidLanguageTag,
  isValidTimeZone,
  mergeCmsPreferences,
} from '../utils/preferences';

describe('isValidTimeZone', () => {
  it('acepta zonas IANA reconocidas', () => {
    expect(isValidTimeZone('Europe/Madrid')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
  });

  it('rechaza zonas vacías, inventadas o demasiado largas', () => {
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('Europe/Madrid; drop table')).toBe(false);
    expect(isValidTimeZone('A'.repeat(65))).toBe(false);
  });

  it('rechaza desfases y nombres en minúsculas aunque el motor los acepte', () => {
    expect(isValidTimeZone('+01:00')).toBe(false);
    expect(isValidTimeZone('-0530')).toBe(false);
    expect(isValidTimeZone('europe/madrid')).toBe(false);
    expect(isValidTimeZone('utc')).toBe(false);
  });
});

describe('isValidLanguageTag', () => {
  it('acepta etiquetas simples y con región', () => {
    expect(isValidLanguageTag('es')).toBe(true);
    expect(isValidLanguageTag('en-US')).toBe(true);
  });

  it('rechaza cualquier otra forma', () => {
    expect(isValidLanguageTag('')).toBe(false);
    expect(isValidLanguageTag('english')).toBe(false);
    expect(isValidLanguageTag('es_ES')).toBe(false);
    expect(isValidLanguageTag('<script>')).toBe(false);
  });
});

describe('mergeCmsPreferences', () => {
  it('conserva las claves que no se envían', () => {
    expect(
      mergeCmsPreferences(
        { language: 'en-US', timezone: 'UTC' },
        { timezone: 'Europe/Madrid' },
      ),
    ).toEqual({ language: 'en-US', timezone: 'Europe/Madrid' });
  });

  it('parte de un objeto vacío si lo guardado no es un objeto', () => {
    expect(mergeCmsPreferences(null, { language: 'es' })).toEqual({
      language: 'es',
    });
    expect(mergeCmsPreferences(['x'], { timezone: 'UTC' })).toEqual({
      timezone: 'UTC',
    });
  });
});
