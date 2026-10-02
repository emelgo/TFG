/**
 * Pruebas de los esquemas de Ajustes > Recursos (F2.7c): son estrictos,
 * tienen límites y la fusión de columnas solo toca la presentación.
 */
import { describe, expect, it } from 'vitest';

import { isProtectedSchema } from '@pymekit/cms-data-explorer-core/protected-schemas';

import {
  ResourceParamsSchema,
  SaveLayoutSchema,
  SyncTablesSchema,
  TableMetadataSchema,
  UpdateTableColumnsConfigSchema,
  getLayoutFieldNames,
  mergeColumnsConfig,
} from '../api/schemas';

describe('esquemas estrictos', () => {
  it('rechaza claves desconocidas y campos estructurales de columnas', () => {
    expect(
      UpdateTableColumnsConfigSchema.safeParse({
        name: { is_primary_key: true },
      }).success,
    ).toBe(false);
    expect(
      UpdateTableColumnsConfigSchema.safeParse({
        name: { ui_config: { data_type: 'text' } },
      }).success,
    ).toBe(false);
    expect(
      UpdateTableColumnsConfigSchema.safeParse({
        name: { display_name: 'Nombre', ui_config: { ui_data_type: 'email' } },
      }).success,
    ).toBe(true);
    expect(
      UpdateTableColumnsConfigSchema.safeParse({
        name: { ui_config: { ui_data_type: '<script>' } },
      }).success,
    ).toBe(false);
    expect(UpdateTableColumnsConfigSchema.safeParse({}).success).toBe(false);
  });

  it('value_labels solo admite texto acotado por valor (F3b)', () => {
    const parse = (value_labels: unknown) =>
      UpdateTableColumnsConfigSchema.safeParse({
        status: { ui_config: { value_labels } },
      }).success;

    expect(parse({ in_app: 'En la aplicación' })).toBe(true);
    expect(parse(null)).toBe(true);
    expect(parse({ in_app: 42 })).toBe(false);
    expect(parse({ in_app: '' })).toBe(false);
    expect(parse({ in_app: 'x'.repeat(101) })).toBe(false);
    expect(
      parse(
        Object.fromEntries(
          Array.from({ length: 201 }, (_, i) => [`v${i}`, 'x']),
        ),
      ),
    ).toBe(false);
  });

  it('valida identificadores y vacía textos con cadena vacía', () => {
    expect(
      ResourceParamsSchema.safeParse({ schema: 'demo', table: 'a"b' }).success,
    ).toBe(false);
    expect(SyncTablesSchema.safeParse({ schema: 'demo', x: 1 }).success).toBe(
      false,
    );
    expect(TableMetadataSchema.parse({ display_name: '' })).toEqual({
      display_name: null,
    });
    expect(
      TableMetadataSchema.safeParse({ display_name: 'x'.repeat(256) }).success,
    ).toBe(false);
  });

  it('el área se recorta, se vacía con cadena vacía y tiene un máximo', () => {
    expect(TableMetadataSchema.parse({ navigation_group: '  Blog ' })).toEqual({
      navigation_group: 'Blog',
    });
    expect(TableMetadataSchema.parse({ navigation_group: '' })).toEqual({
      navigation_group: null,
    });
    expect(
      TableMetadataSchema.safeParse({ navigation_group: 'x'.repeat(61) })
        .success,
    ).toBe(false);
    expect(TableMetadataSchema.safeParse({ navigation_group: 3 }).success).toBe(
      false,
    );
  });

  it('la distribución no admite metadata libre ni tamaños fuera de 1–4', () => {
    const layout = (column: Record<string, unknown>) => ({
      layout: {
        id: 'l',
        name: 'n',
        display: [
          { id: 'g', label: 'G', rows: [{ id: 'r', columns: [column] }] },
        ],
        edit: [],
      },
    });

    expect(
      SaveLayoutSchema.safeParse(
        layout({ id: 'c', fieldName: 'name', size: 2, metadata: {} }),
      ).success,
    ).toBe(false);
    expect(
      SaveLayoutSchema.safeParse(
        layout({ id: 'c', fieldName: 'name', size: 5 }),
      ).success,
    ).toBe(false);

    const parsed = SaveLayoutSchema.parse(
      layout({ id: 'c', fieldName: 'name', size: 2 }),
    );

    expect([...getLayoutFieldNames(parsed.layout)]).toEqual(['name']);
    expect(SaveLayoutSchema.parse({ layout: null }).layout).toBeNull();
  });
});

describe('mergeColumnsConfig', () => {
  const current = {
    name: {
      is_primary_key: false,
      display_name: 'Name',
      ui_config: { data_type: 'text', ui_data_type: 'text' },
    },
  };

  it('fusiona campo a campo y conserva lo estructural', () => {
    expect(
      mergeColumnsConfig(current, {
        name: { display_name: 'Nombre', ui_config: { ui_data_type: 'email' } },
      }),
    ).toEqual({
      name: {
        is_primary_key: false,
        display_name: 'Nombre',
        ui_config: { data_type: 'text', ui_data_type: 'email' },
      },
    });
  });

  it('rechaza columnas que no existen', () => {
    expect(mergeColumnsConfig(current, { other: { ordering: 1 } })).toBeNull();
  });
});

describe('isProtectedSchema', () => {
  it('protege los esquemas del sistema y cualquier pg_*', () => {
    for (const schema of [
      'auth',
      'vault',
      'cms',
      'storage',
      'pg_catalog',
      'PG_TOAST',
    ]) {
      expect(isProtectedSchema(schema)).toBe(true);
    }

    expect(isProtectedSchema('demo')).toBe(false);
    expect(isProtectedSchema('public')).toBe(false);
  });
});
