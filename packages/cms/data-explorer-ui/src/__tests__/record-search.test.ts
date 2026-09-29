/**
 * Pruebas del estado de la ficha de un registro en la URL: columnas de una
 * clave compuesta y página de cada sección de registros relacionados.
 */
import { describe, expect, it } from 'vitest';

import {
  getRecordKeysFromSearch,
  getRelatedPage,
  parseRecordKeysSearch,
  withRelatedPage,
} from '../utils/record-search';

describe('parseRecordKeysSearch', () => {
  it('conserva las columnas de la clave como texto', () => {
    expect(
      parseRecordKeysSearch({ user_id: 'u-1', account_id: 'a-1', position: 3 }),
    ).toEqual({ user_id: 'u-1', account_id: 'a-1', position: '3' });
  });

  it('valida `relatedPages` y no lo trata como columna', () => {
    expect(
      parseRecordKeysSearch({
        id: 'x',
        relatedPages: { 'public.accounts_memberships.account_id': 2 },
      }),
    ).toEqual({
      id: 'x',
      relatedPages: { 'public.accounts_memberships.account_id': 2 },
    });
  });

  it('descarta páginas no válidas y valores que no son escalares', () => {
    expect(
      parseRecordKeysSearch({
        id: 'x',
        nested: { a: 1 },
        relatedPages: { a: 0 },
      }),
    ).toEqual({ id: 'x' });
  });
});

describe('getRecordKeysFromSearch', () => {
  it('ignora `relatedPages` y convierte booleanos y números', () => {
    expect(
      getRecordKeysFromSearch({
        active: true,
        id: 7,
        relatedPages: { a: 2 },
      }),
    ).toEqual({ active: 'true', id: '7' });
  });
});

describe('páginas de las secciones relacionadas', () => {
  it('la página por defecto es la 1', () => {
    expect(getRelatedPage({}, 'public.x.y')).toBe(1);
    expect(getRelatedPage({ relatedPages: { a: 3 } }, 'a')).toBe(3);
  });

  it('escribe la página y conserva el resto de la URL', () => {
    expect(
      withRelatedPage({ id: 'k', relatedPages: { b: 2 } }, 'a', 4),
    ).toEqual({ id: 'k', relatedPages: { b: 2, a: 4 } });
  });

  it('volver a la página 1 limpia la entrada (y el parámetro si queda vacío)', () => {
    expect(withRelatedPage({ relatedPages: { a: 4 } }, 'a', 1)).toEqual({
      relatedPages: undefined,
    });
  });
});
