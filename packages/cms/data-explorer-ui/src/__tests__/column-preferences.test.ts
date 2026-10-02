/**
 * Pruebas de las preferencias de columnas (visibilidad, fijado y orden).
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_COLUMN_PREFERENCES,
  getColumnPinSide,
  moveColumn,
  parseColumnPreferences,
  toggleColumnPin,
  toggleColumnVisibility,
} from '../utils/column-preferences';

describe('parseColumnPreferences', () => {
  it('descarta columnas que ya no existen y valores mal formados', () => {
    const raw = JSON.stringify({
      visibility: { name: false, gone: false, email: 'no' },
      pinning: { left: ['name', 'gone'], right: 'x' },
      order: ['email', 'gone', 'name'],
    });

    expect(parseColumnPreferences(raw, ['name', 'email'])).toEqual({
      visibility: { name: false },
      pinning: { left: ['name'], right: [] },
      order: ['email', 'name'],
      version: 1,
    });
  });

  it('usa los valores por defecto si no hay nada o está corrupto', () => {
    expect(parseColumnPreferences(null, [])).toBe(DEFAULT_COLUMN_PREFERENCES);
    expect(parseColumnPreferences('{', [])).toBe(DEFAULT_COLUMN_PREFERENCES);
  });
});

describe('acciones', () => {
  it('oculta y vuelve a mostrar una columna', () => {
    const hidden = toggleColumnVisibility(DEFAULT_COLUMN_PREFERENCES, 'name');

    expect(hidden.visibility.name).toBe(false);
    expect(toggleColumnVisibility(hidden, 'name').visibility.name).toBe(true);
  });

  it('fija y suelta una columna', () => {
    const pinned = toggleColumnPin(DEFAULT_COLUMN_PREFERENCES, 'name');

    expect(getColumnPinSide(pinned, 'name')).toBe('left');
    expect(getColumnPinSide(toggleColumnPin(pinned, 'name'), 'name')).toBe(
      false,
    );
  });

  it('sube y baja columnas sin salirse de los extremos', () => {
    const order = ['a', 'b', 'c'];

    expect(
      moveColumn(DEFAULT_COLUMN_PREFERENCES, order, 'c', 'up').order,
    ).toEqual(['a', 'c', 'b']);
    expect(moveColumn(DEFAULT_COLUMN_PREFERENCES, order, 'a', 'up')).toBe(
      DEFAULT_COLUMN_PREFERENCES,
    );
  });
});
