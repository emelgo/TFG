/**
 * Pruebas de las utilidades de la búsqueda global: cuándo se busca, cómo se
 * agrupan los resultados y a qué ficha enlaza cada uno.
 */
import { describe, expect, it } from 'vitest';

import {
  getGlobalSearchResultUrl,
  groupGlobalSearchResults,
  normalizeGlobalSearchQuery,
} from '../utils/global-search';

const item = (
  tableName: string,
  title: string,
  keys: Record<string, string> = { id: title },
) => ({
  schemaName: 'public',
  tableName,
  tableDisplay: tableName === 'accounts' ? 'Accounts' : '',
  title,
  keys,
});

describe('normalizeGlobalSearchQuery', () => {
  it('no busca textos de menos de 2 caracteres', () => {
    expect(normalizeGlobalSearchQuery(' a ')).toBeNull();
    expect(normalizeGlobalSearchQuery('')).toBeNull();
  });

  it('recorta espacios y la longitud máxima', () => {
    expect(normalizeGlobalSearchQuery('  ana  ')).toBe('ana');
    expect(normalizeGlobalSearchQuery('x'.repeat(150))).toHaveLength(100);
  });
});

describe('groupGlobalSearchResults', () => {
  it('agrupa por tabla en orden de primera aparición', () => {
    const groups = groupGlobalSearchResults([
      item('accounts', 'Ana'),
      item('accounts_memberships', 'm1'),
      item('accounts', 'Andrés'),
    ]);

    expect(groups.map((group) => [group.key, group.items.length])).toEqual([
      ['public.accounts', 2],
      ['public.accounts_memberships', 1],
    ]);
    // Sin nombre visible se usa el de la tabla.
    expect(groups[1]!.tableDisplay).toBe('accounts_memberships');
  });

  it('sin resultados no hay grupos', () => {
    expect(groupGlobalSearchResults([])).toEqual([]);
  });
});

describe('getGlobalSearchResultUrl', () => {
  it('clave simple → /record/<valor> codificado', () => {
    expect(
      getGlobalSearchResultUrl(item('accounts', 'a/b', { id: 'a/b' })),
    ).toBe('/admin/cms/resources/public/accounts/record/a%2Fb');
  });

  it('codifica esquema y tabla para que no cambien la ruta', () => {
    expect(
      getGlobalSearchResultUrl({
        ...item('x/../../users', 'a'),
        schemaName: 'public',
      }),
    ).toBe('/admin/cms/resources/public/x%2F..%2F..%2Fusers/record/a');
  });

  it('clave compuesta → /record?col=valor', () => {
    expect(
      getGlobalSearchResultUrl(
        item('accounts_memberships', 'm', { user_id: 'u1', account_id: 'a1' }),
      ),
    ).toBe(
      '/admin/cms/resources/public/accounts_memberships/record?user_id=u1&account_id=a1',
    );
  });
});
