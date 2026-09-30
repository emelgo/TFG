/**
 * Pruebas de la agrupación por esquema de las tablas legibles del CMS.
 */
import { describe, expect, it } from 'vitest';

import {
  getSidebarResourceGroups,
  getVisibleResources,
  groupResourcesBySchema,
  isResourcePathActive,
} from '../resources';

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

describe('getSidebarResourceGroups', () => {
  it('con un solo esquema no muestra su nombre', () => {
    const result = getSidebarResourceGroups([
      resource('public', 'accounts'),
      resource('public', 'roles'),
    ]);

    expect(result.showSchemaLabels).toBe(false);
    expect(result.groups).toHaveLength(1);
    expect(result.hiddenCount).toBe(0);
  });

  it('con varios esquemas agrupa y muestra sus nombres', () => {
    const result = getSidebarResourceGroups([
      resource('public', 'accounts'),
      resource('demo', 'customers'),
      resource('public', 'roles'),
    ]);

    expect(result.showSchemaLabels).toBe(true);
    expect(result.groups.map((group) => group.schemaName)).toEqual([
      'public',
      'demo',
    ]);
  });

  it('limita el número total de tablas y cuenta las ocultas', () => {
    const result = getSidebarResourceGroups(
      [
        resource('public', 'a'),
        resource('public', 'b'),
        resource('demo', 'c'),
        resource('demo', 'd'),
        resource('other', 'e'),
      ],
      3,
    );

    expect(
      result.groups.map((group) => group.items.map((item) => item.tableName)),
    ).toEqual([['a', 'b'], ['c']]);
    expect(result.hiddenCount).toBe(2);
    // El nombre del esquema depende de cuántos esquemas hay, no de cuántos
    // caben en la lista
    expect(result.showSchemaLabels).toBe(true);
  });

  it('no cuenta como ocultas las tablas marcadas como no visibles', () => {
    const result = getSidebarResourceGroups([
      resource('public', 'a'),
      resource('public', 'secret', false),
    ]);

    expect(result.hiddenCount).toBe(0);
    expect(result.groups[0]?.items).toHaveLength(1);
  });

  it('sin tablas devuelve una lista vacía', () => {
    expect(getSidebarResourceGroups([])).toEqual({
      groups: [],
      showSchemaLabels: false,
      hiddenCount: 0,
    });
  });
});

describe('isResourcePathActive', () => {
  it('marca activa la tabla en su listado y sus subrutas', () => {
    expect(
      isResourcePathActive(
        '/admin/cms/resources/demo/orders',
        'demo',
        'orders',
      ),
    ).toBe(true);
    expect(
      isResourcePathActive(
        '/admin/cms/resources/demo/orders/record/3',
        'demo',
        'orders',
      ),
    ).toBe(true);
    expect(
      isResourcePathActive(
        '/admin/cms/resources/demo/orders/',
        'demo',
        'orders',
      ),
    ).toBe(true);
  });

  it('admite nombres con caracteres no ASCII (la ruta llega decodificada)', () => {
    expect(
      isResourcePathActive(
        '/admin/cms/resources/demo/categorías',
        'demo',
        'categorías',
      ),
    ).toBe(true);
  });

  it('compara segmentos completos', () => {
    expect(
      isResourcePathActive(
        '/admin/cms/resources/demo/order_items',
        'demo',
        'orders',
      ),
    ).toBe(false);
    expect(
      isResourcePathActive(
        '/admin/cms/resources/public/orders',
        'demo',
        'orders',
      ),
    ).toBe(false);
  });
});
