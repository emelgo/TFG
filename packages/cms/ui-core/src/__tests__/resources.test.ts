/**
 * Pruebas de la agrupación por área de las tablas legibles del CMS.
 */
import { describe, expect, it } from 'vitest';

import {
  getAreaNames,
  getResourceArea,
  getVisibleResources,
  groupByArea,
  groupResourcesByArea,
  isResourcePathActive,
  normalizeNavigationGroup,
} from '../resources';

function resource(
  tableName: string,
  options: {
    area?: unknown;
    ordering?: number | null;
    displayName?: string;
    isVisible?: boolean | null;
    schemaName?: string;
  } = {},
) {
  return {
    schemaName: options.schemaName ?? 'public',
    tableName,
    displayName: options.displayName ?? tableName,
    metadata: {
      isVisible: options.isVisible ?? true,
      ordering: options.ordering ?? null,
      uiConfig:
        options.area === undefined
          ? { primary_keys: [] }
          : { primary_keys: [], navigation_group: options.area },
    },
  };
}

describe('getResourceArea', () => {
  it('lee navigation_group de ui_config y lo recorta', () => {
    expect(getResourceArea(resource('a', { area: '  Blog ' }))).toBe('Blog');
  });

  it('trata como «sin área» lo vacío, lo ausente y lo que no es texto', () => {
    expect(getResourceArea(resource('a'))).toBeNull();
    expect(getResourceArea(resource('a', { area: '   ' }))).toBeNull();
    expect(getResourceArea(resource('a', { area: 42 }))).toBeNull();
    expect(
      getResourceArea({ ...resource('a'), metadata: { isVisible: true } }),
    ).toBeNull();
    expect(normalizeNavigationGroup(null)).toBeNull();
  });
});

describe('groupResourcesByArea', () => {
  it('ordena las áreas por el menor ordering y después por nombre', () => {
    const groups = groupResourcesByArea([
      resource('orders', { area: 'Facturación', ordering: 30 }),
      resource('accounts', { area: 'Cuentas', ordering: 20 }),
      resource('posts', { area: 'Blog', ordering: 10 }),
      resource('zeta', { area: 'Zeta' }),
      resource('alfa', { area: 'Alfa' }),
    ]);

    expect(groups.map((group) => group.name)).toEqual([
      'Blog',
      'Cuentas',
      'Facturación',
      'Alfa',
      'Zeta',
    ]);
  });

  it('a igual ordering compara nombres sin distinguir tildes ni mayúsculas', () => {
    const groups = groupResourcesByArea([
      resource('b', { area: 'facturación' }),
      resource('a', { area: 'Ámbito' }),
      resource('c', { area: 'Cuentas' }),
    ]);

    expect(groups.map((group) => group.name)).toEqual([
      'Ámbito',
      'Cuentas',
      'facturación',
    ]);
  });

  it('dentro de un área ordena por ordering y después por nombre visible', () => {
    const [group] = groupResourcesByArea([
      resource('roles', { area: 'Cuentas', displayName: 'Roles' }),
      resource('invitations', { area: 'Cuentas', displayName: 'Invitaciones' }),
      resource('accounts', {
        area: 'Cuentas',
        displayName: 'Cuentas',
        ordering: 1,
      }),
    ]);

    expect(group?.items.map((item) => item.tableName)).toEqual([
      'accounts',
      'invitations',
      'roles',
    ]);
  });

  it('deja las tablas sin área en un grupo final con nombre nulo', () => {
    const groups = groupResourcesByArea([
      resource('loose', { ordering: 0 }),
      resource('posts', { area: 'Blog', ordering: 50 }),
    ]);

    expect(groups.map((group) => group.name)).toEqual(['Blog', null]);
    expect(groups[1]?.items.map((item) => item.tableName)).toEqual(['loose']);
  });

  it('oculta las tablas no visibles y las áreas que se quedan vacías', () => {
    const groups = groupResourcesByArea([
      resource('posts', { area: 'Blog', isVisible: false }),
      resource('accounts', { area: 'Cuentas', isVisible: null }),
    ]);

    expect(groups.map((group) => group.name)).toEqual(['Cuentas']);
  });

  it('devuelve una lista vacía sin recursos', () => {
    expect(groupResourcesByArea([])).toEqual([]);
  });
});

describe('groupByArea', () => {
  it('admite filas de cualquier forma mediante accesores', () => {
    const groups = groupByArea(
      [
        { name: 'b', group: null, order: null },
        { name: 'a', group: 'Blog', order: 2 },
      ],
      {
        area: (row) => row.group,
        ordering: (row) => row.order,
        label: (row) => row.name,
      },
    );

    expect(groups).toEqual([
      { name: 'Blog', items: [{ name: 'a', group: 'Blog', order: 2 }] },
      { name: null, items: [{ name: 'b', group: null, order: null }] },
    ]);
  });
});

describe('getAreaNames', () => {
  it('devuelve las áreas sin repetir, recortadas y en orden alfabético', () => {
    expect(
      getAreaNames([
        'Sistema',
        ' Blog',
        null,
        '',
        'Blog',
        undefined,
        'Cuentas',
      ]),
    ).toEqual(['Blog', 'Cuentas', 'Sistema']);
  });
});

describe('getVisibleResources', () => {
  it('cuenta is_visible nulo como visible', () => {
    expect(
      getVisibleResources([
        resource('a', { isVisible: null }),
        resource('b', { isVisible: false }),
      ]).map((item) => item.tableName),
    ).toEqual(['a']);
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
