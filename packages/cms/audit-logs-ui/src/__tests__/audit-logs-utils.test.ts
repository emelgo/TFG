/**
 * Pruebas de las utilidades del registro de auditoría: filtros ↔ URL,
 * paginación por cursor, comparación de datos y enlaces al registro afectado.
 */
import { describe, expect, it } from 'vitest';

import {
  AuditLogsSearchSchema,
  buildAuditLogDiff,
  countAuditLogChanges,
  getAuditLogRecordHref,
  getNextPageSearch,
  getPreviousPageSearch,
  hasActiveAuditLogsFilters,
  hasPreviousAuditLogsPage,
  isSameValue,
  parseResourceFilter,
  toAuditLogDisplayValue,
  toAuditLogsFilterValues,
  toAuditLogsListParams,
  withAuditLogsFilters,
} from '../utils';

describe('AuditLogsSearchSchema', () => {
  it('descarta los valores no válidos en lugar de romper la página', () => {
    expect(
      AuditLogsSearchSchema.parse({
        author: "x' or 1=1",
        actions: ['INSERT;DROP'],
        schema: 'public.x',
        severity: 'critical',
        from: 'ayer',
        to: '2026-02-31',
      }),
    ).toEqual({
      author: undefined,
      actions: undefined,
      schema: undefined,
      severity: undefined,
      from: undefined,
      to: undefined,
    });
  });
});

describe('filtros ↔ URL', () => {
  it('aplicar filtros vuelve a la primera página y omite los vacíos', () => {
    expect(
      withAuditLogsFilters({
        author: '  c5b930c9 ',
        actions: ['UPDATE'],
        resource: 'public.notifications',
        severity: '',
        from: '2026-09-30',
        to: '',
      }),
    ).toEqual({
      author: 'c5b930c9',
      actions: ['UPDATE'],
      schema: 'public',
      table: 'notifications',
      severity: undefined,
      from: '2026-09-30',
      to: undefined,
    });
  });

  it('el formulario se rellena desde la URL', () => {
    expect(
      toAuditLogsFilterValues({ schema: 'public', table: 'accounts' }),
    ).toMatchObject({ resource: 'public.accounts', actions: [] });
  });

  it('traduce la URL a los parámetros de la API', () => {
    expect(
      toAuditLogsListParams({
        cursor: 'c2',
        prev: ['', 'c1'],
        actions: ['INSERT'],
        from: '2026-09-01',
        to: '2026-09-30',
      }),
    ).toEqual({
      cursor: 'c2',
      author: undefined,
      actions: ['INSERT'],
      schema: undefined,
      table: undefined,
      severity: undefined,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
  });

  it('detecta si hay filtros activos (la paginación no cuenta)', () => {
    expect(hasActiveAuditLogsFilters({ cursor: 'x', prev: [''] })).toBe(false);
    expect(hasActiveAuditLogsFilters({ severity: 'error' })).toBe(true);
  });

  it.each([
    ['accounts', { table: 'accounts' }],
    ['public.accounts', { schema: 'public', table: 'accounts' }],
    ['', null],
    ['a.b.c', null],
    ['public."x"', null],
  ])('parseResourceFilter(%s)', (value, expected) => {
    expect(parseResourceFilter(value)).toEqual(expected);
  });
});

describe('paginación por cursor', () => {
  it('avanza guardando la página actual y vuelve atrás hasta la primera', () => {
    const first = { actions: ['INSERT'] };
    const second = getNextPageSearch(first, 'c1');
    const third = getNextPageSearch(second, 'c2');

    expect(second).toEqual({ actions: ['INSERT'], prev: [''], cursor: 'c1' });
    expect(third.prev).toEqual(['', 'c1']);
    expect(hasPreviousAuditLogsPage(third)).toBe(true);

    const back = getPreviousPageSearch(third);

    expect(back).toEqual(second);
    expect(getPreviousPageSearch(back)).toEqual({
      actions: ['INSERT'],
      prev: undefined,
      cursor: undefined,
    });
    expect(hasPreviousAuditLogsPage(first)).toBe(false);
  });
});

describe('buildAuditLogDiff', () => {
  it('marca los campos cambiados, añadidos, quitados e iguales', () => {
    const diff = buildAuditLogDiff(
      { id: 1, body: 'a', dismissed: false, gone: 'x', meta: { a: 1, b: 2 } },
      { id: 1, body: 'a', dismissed: true, added: 'y', meta: { b: 2, a: 1 } },
    );

    expect(diff.map((entry) => [entry.key, entry.status])).toEqual([
      ['dismissed', 'changed'],
      ['added', 'added'],
      ['gone', 'removed'],
      ['body', 'unchanged'],
      ['id', 'unchanged'],
      ['meta', 'unchanged'],
    ]);
    expect(countAuditLogChanges(diff)).toBe(3);
  });

  it('un INSERT tiene todos los campos añadidos y un DELETE quitados', () => {
    expect(
      buildAuditLogDiff(null, { id: 1 }).map((entry) => entry.status),
    ).toEqual(['added']);
    expect(
      buildAuditLogDiff({ id: 1 }, null).map((entry) => entry.status),
    ).toEqual(['removed']);
  });

  it('sin datos no hay filas', () => {
    expect(buildAuditLogDiff(null, null)).toEqual([]);
  });

  it('la igualdad es estructural', () => {
    expect(isSameValue([1, { a: 1, b: 2 }], [1, { b: 2, a: 1 }])).toBe(true);
    expect(isSameValue(null, undefined)).toBe(false);
    expect(isSameValue('1', 1)).toBe(false);
  });
});

describe('toAuditLogDisplayValue', () => {
  it('distingue vacío, booleano, JSON y texto largo', () => {
    expect(toAuditLogDisplayValue(null)).toEqual({ kind: 'empty' });
    expect(toAuditLogDisplayValue(false)).toEqual({
      kind: 'boolean',
      value: false,
    });
    expect(toAuditLogDisplayValue({ a: 1 })).toEqual({
      kind: 'json',
      text: '{\n  "a": 1\n}',
    });
    expect(toAuditLogDisplayValue('x'.repeat(10), 4)).toEqual({
      kind: 'text',
      text: 'xxxx…',
      truncated: true,
    });
  });
});

describe('getAuditLogRecordHref', () => {
  it('enlaza a la ficha del registro o del usuario', () => {
    expect(
      getAuditLogRecordHref({
        schemaName: 'public',
        tableName: 'notifications',
        recordId: '42',
      }),
    ).toBe('/admin/cms/resources/public/notifications/record/42');

    expect(
      getAuditLogRecordHref({
        schemaName: 'auth',
        tableName: 'users',
        recordId: 'c5b930c9-0a76-412e-a836-4bc4849a3270',
      }),
    ).toBe('/admin/cms/users/c5b930c9-0a76-412e-a836-4bc4849a3270');
  });

  it('no enlaza tablas del CMS, claves compuestas ni esquemas protegidos', () => {
    for (const log of [
      { schemaName: 'cms', tableName: 'roles', recordId: 'x' },
      { schemaName: 'public', tableName: 'm', recordId: 'a|b' },
      { schemaName: 'auth', tableName: 'identities', recordId: 'x' },
      { schemaName: 'public', tableName: 'm', recordId: null },
    ]) {
      expect(getAuditLogRecordHref(log)).toBeNull();
    }
  });

  it('codifica el identificador para que no cambie la ruta', () => {
    expect(
      getAuditLogRecordHref({
        schemaName: 'public',
        tableName: 't',
        recordId: '../x?y',
      }),
    ).toBe('/admin/cms/resources/public/t/record/..%2Fx%3Fy');
  });
});
