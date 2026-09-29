/**
 * Pruebas de la agrupación por esquema de las tablas legibles del CMS.
 */
import { describe, expect, it } from 'vitest';

import { getVisibleResources, groupResourcesBySchema } from '../resources';

function resource(schemaName: string, tableName: string, isVisible = true) {
  return { schemaName, tableName, metadata: { isVisible } };
}

describe('groupResourcesBySchema', () => {
  it('agrupa por esquema conservando el orden de llegada', () => {
    const groups = groupResourcesBySchema([
      resource('public', 'accounts'),
      resource('auth', 'users'),
      resource('public', 'roles'),
    ]);

    expect(groups.map((group) => group.schemaName)).toEqual(['public', 'auth']);
    expect(groups[0]?.items.map((item) => item.tableName)).toEqual([
      'accounts',
      'roles',
    ]);
  });

  it('descarta las tablas marcadas como no visibles', () => {
    const groups = groupResourcesBySchema([
      resource('public', 'accounts'),
      resource('public', 'secrets', false),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toHaveLength(1);
  });

  it('considera visible un valor nulo (valor por defecto de la BD)', () => {
    const items = [
      { schemaName: 'public', tableName: 'x', metadata: { isVisible: null } },
    ];

    expect(getVisibleResources(items)).toHaveLength(1);
  });
});
