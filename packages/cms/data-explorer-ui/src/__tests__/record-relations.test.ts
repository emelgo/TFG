/**
 * Pruebas de las relaciones de la ficha: enlaces de las claves foráneas,
 * filtros de las secciones relacionadas y qué relaciones se muestran según
 * las tablas que puede leer el usuario.
 */
import { describe, expect, it } from 'vitest';

import {
  type ForeignKeyRecord,
  buildJunctionFilters,
  buildM2MTargetFilters,
  buildOneToManyFilters,
  getForeignKeyLink,
  getReadableTableKeys,
  getRecordDisplayName,
  getVisibleRelatedRelations,
} from '../utils/record-relations';

const accountRecord: ForeignKeyRecord = {
  column: 'account_id',
  data: { id: 'acc-1', name: 'Acme', slug: 'acme' },
  metadata: {
    table: {
      schemaName: 'public',
      tableName: 'accounts',
      displayFormat: '{name} ({slug})',
      uiConfig: { primary_keys: [{ column_name: 'id' }] },
    },
  },
};

describe('getRecordDisplayName', () => {
  it('usa el formato de la tabla', () => {
    expect(
      getRecordDisplayName('{name} <{email}>', { name: 'A', email: 'e' }),
    ).toBe('A <e>');
  });

  it('si el formato queda vacío, prueba columnas habituales y la clave', () => {
    expect(getRecordDisplayName('{missing}', { title: 'T' })).toBe('T');
    expect(getRecordDisplayName(null, { id: 42 })).toBe('42');
    expect(getRecordDisplayName(null, { other: 1 }, 'k')).toBe('k');
    expect(getRecordDisplayName(null, {})).toBe('');
  });
});

describe('getForeignKeyLink', () => {
  it('enlaza a la ficha de la fila destino con su etiqueta', () => {
    expect(getForeignKeyLink([accountRecord], 'account_id', 'acc-1')).toEqual({
      label: 'Acme (acme)',
      href: '/admin/cms/resources/public/accounts/record/acc-1',
    });
  });

  it('distingue claves foráneas a la misma tabla por su columna', () => {
    expect(getForeignKeyLink([accountRecord], 'owner_id', 'acc-1')).toBeNull();
  });

  it('sin fila legible no hay enlace', () => {
    expect(getForeignKeyLink([], 'account_id', 'acc-1')).toBeNull();
  });

  it('usa la clave compuesta de la tabla destino', () => {
    const membership: ForeignKeyRecord = {
      column: 'membership',
      data: { user_id: 'u', account_id: 'a' },
      metadata: {
        table: {
          schemaName: 'public',
          tableName: 'accounts_memberships',
          displayFormat: null,
          uiConfig: {
            primary_keys: [
              { column_name: 'user_id' },
              { column_name: 'account_id' },
            ],
          },
        },
      },
    };

    expect(getForeignKeyLink([membership], 'membership', 'x')?.href).toBe(
      '/admin/cms/resources/public/accounts_memberships/record?user_id=u&account_id=a',
    );
  });
});

describe('filtros de las secciones relacionadas', () => {
  const o2m = {
    type: 'one_to_many' as const,
    source_column: 'id',
    target_column: 'account_id',
    target_schema: 'public',
    target_table: 'accounts_memberships',
  };

  const m2m = {
    sourceColumn: 'id',
    targetSchema: 'public',
    targetTable: 'tags',
    targetColumn: 'id',
    junctionSchema: 'public',
    junctionTable: 'post_tags',
    junctionSourceColumn: 'post_id',
    junctionTargetColumn: 'tag_id',
  };

  it('uno a muchos filtra la tabla hija por la columna destino', () => {
    expect(buildOneToManyFilters(o2m, { id: 'acc-1' })).toEqual({
      'account_id.eq': 'acc-1',
    });
    expect(buildOneToManyFilters(o2m, { id: 0 })).toEqual({
      'account_id.eq': '0',
    });
  });

  it('sin valor (o con un objeto) no hay filtro', () => {
    expect(buildOneToManyFilters(o2m, { id: null })).toBeNull();
    expect(buildOneToManyFilters(o2m, { id: { a: 1 } })).toBeNull();
  });

  it('muchos a muchos filtra la intermedia y después la tabla destino', () => {
    expect(buildJunctionFilters(m2m, { id: 5 })).toEqual({ 'post_id.eq': '5' });
    expect(buildM2MTargetFilters(m2m, [1, 2])).toEqual({ 'id.in': '[1,2]' });
  });
});

describe('getVisibleRelatedRelations', () => {
  const relationsConfig = [
    {
      relation_type: 'many_to_one',
      source_column: 'owner_id',
      target_schema: 'auth',
      target_table: 'users',
      target_column: 'id',
    },
    {
      relation_type: 'one_to_many',
      source_column: 'id',
      target_schema: 'public',
      target_table: 'comments',
      target_column: 'post_id',
    },
    {
      relation_type: 'one_to_many',
      source_column: 'id',
      target_schema: 'public',
      target_table: 'billing',
      target_column: 'post_id',
    },
    {
      relation_type: 'one_to_many',
      source_column: 'id',
      target_schema: 'public',
      target_table: 'hidden',
      target_column: 'post_id',
      inline_config: { enabled: false },
    },
    {
      relation_type: 'one_to_many',
      source_column: 'id',
      target_schema: 'public',
      target_table: 'post_tags',
      target_column: 'post_id',
    },
  ];

  const junctionMetadataMap = {
    'public.post_tags': {
      ui_config: {
        primary_keys: [{ column_name: 'post_id' }, { column_name: 'tag_id' }],
      },
      relations_config: [
        {
          relation_type: 'many_to_one',
          source_column: 'post_id',
          target_schema: 'public',
          target_table: 'posts',
          target_column: 'id',
        },
        {
          relation_type: 'many_to_one',
          source_column: 'tag_id',
          target_schema: 'public',
          target_table: 'tags',
          target_column: 'id',
        },
      ],
    },
  };

  it('muestra solo las tablas legibles y agrupa las intermedias como M2M', () => {
    const readableTables = getReadableTableKeys([
      { schemaName: 'public', tableName: 'comments' },
      { schemaName: 'public', tableName: 'hidden' },
      { schemaName: 'public', tableName: 'post_tags' },
      { schemaName: 'public', tableName: 'tags' },
    ]);

    const result = getVisibleRelatedRelations({
      schema: 'public',
      table: 'posts',
      relationsConfig,
      junctionMetadataMap,
      readableTables,
    });

    expect(result.oneToMany.map((r) => r.target_table)).toEqual(['comments']);
    expect(result.manyToMany).toEqual([
      expect.objectContaining({
        targetTable: 'tags',
        junctionTable: 'post_tags',
        junctionSourceColumn: 'post_id',
        junctionTargetColumn: 'tag_id',
      }),
    ]);
  });

  it('sin permiso sobre la tabla destino, la M2M no se muestra (ni su intermedia)', () => {
    const result = getVisibleRelatedRelations({
      schema: 'public',
      table: 'posts',
      relationsConfig,
      junctionMetadataMap,
      readableTables: getReadableTableKeys([
        { schemaName: 'public', tableName: 'post_tags' },
      ]),
    });

    expect(result.manyToMany).toEqual([]);
    // La intermedia legible vuelve a mostrarse como uno a muchos normal.
    expect(result.oneToMany.map((r) => r.target_table)).toEqual(['post_tags']);
  });

  it('sin metadato de intermedias, todo son uno a muchos', () => {
    const result = getVisibleRelatedRelations({
      schema: 'public',
      table: 'posts',
      relationsConfig,
      junctionMetadataMap: undefined,
      readableTables: getReadableTableKeys([
        { schemaName: 'public', tableName: 'post_tags' },
        { schemaName: 'public', tableName: 'tags' },
      ]),
    });

    expect(result.manyToMany).toEqual([]);
    expect(result.oneToMany.map((r) => r.target_table)).toEqual(['post_tags']);
  });
});
