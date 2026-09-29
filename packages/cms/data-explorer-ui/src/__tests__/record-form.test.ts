/**
 * Pruebas de la lógica del formulario de un registro: tipo de control por
 * columna, esquema Zod generado a partir del metadato, conversión de valores
 * entre la base de datos y el formulario, y cuerpo que se envía a la API
 * (solo los campos modificados al editar).
 */
import { describe, expect, it } from 'vitest';

import type { ColumnMetadata } from '@pymekit/cms-types';

import {
  buildRecordPayload,
  createRecordFormSchema,
  getDirtyFields,
  getFieldKind,
  getFieldPlaceholder,
  getFormFields,
  getInitialFormValues,
  isFieldRequired,
  parseStaticDefault,
  stripTypeCast,
  toDatabaseValue,
  toFormValue,
} from '../utils/record-form';

const ERR = 'cms.dataExplorer.record.form.errors';

function column(
  name: string,
  dataType: string,
  overrides: Partial<ColumnMetadata> & {
    ui?: Partial<ColumnMetadata['ui_config']>;
  } = {},
): ColumnMetadata {
  const { ui, ...rest } = overrides;

  return {
    name,
    ordering: 1,
    display_name: null,
    description: null,
    is_searchable: false,
    is_visible_in_table: true,
    is_visible_in_detail: true,
    default_value: null,
    is_sortable: true,
    is_filterable: true,
    is_editable: true,
    is_primary_key: false,
    is_required: false,
    relations: [],
    ui_config: { data_type: dataType as never, ...ui },
    ...rest,
  };
}

// Columnas equivalentes a `public.notifications`.
const notificationColumns = [
  column('id', 'bigint', { is_editable: false, is_primary_key: true }),
  column('account_id', 'uuid', { is_required: true, ordering: 2 }),
  column('type', 'USER-DEFINED', {
    is_required: true,
    ordering: 3,
    default_value: "'info'::public.notification_type",
    ui: { is_enum: true, enum_values: ['info', 'warning', 'error'] },
  }),
  column('body', 'character varying', {
    is_required: true,
    ordering: 4,
    ui: { max_length: 5000 },
  }),
  column('link', 'character varying', { ordering: 5, ui: { max_length: 20 } }),
  column('dismissed', 'boolean', {
    is_required: true,
    ordering: 6,
    default_value: 'false',
  }),
  column('expires_at', 'timestamp with time zone', {
    ordering: 7,
    default_value: "(now() + '1 mon'::interval)",
  }),
];

const relationColumns = new Set(['account_id']);

describe('getFieldKind', () => {
  it('elige el control según relación, tipo de interfaz y tipo de PostgreSQL', () => {
    expect(getFieldKind(column('a', 'uuid'), true)).toBe('relation');
    expect(getFieldKind(column('a', 'boolean'))).toBe('boolean');
    expect(
      getFieldKind(
        column('a', 'USER-DEFINED', {
          ui: { is_enum: true, enum_values: ['x'] },
        }),
      ),
    ).toBe('enum');
    expect(getFieldKind(column('a', 'jsonb'))).toBe('json');
    expect(getFieldKind(column('a', 'ARRAY'))).toBe('array');
    expect(
      getFieldKind(column('a', 'text', { ui: { ui_data_type: 'email' } })),
    ).toBe('email');
    expect(getFieldKind(column('a', 'date'))).toBe('date');
    expect(getFieldKind(column('a', 'timestamp with time zone'))).toBe(
      'datetime',
    );
    expect(getFieldKind(column('a', 'timestamp without time zone'))).toBe(
      'timestamp',
    );
    expect(getFieldKind(column('a', 'time without time zone'))).toBe('time');
    expect(getFieldKind(column('a', 'bigint'))).toBe('integer');
    expect(getFieldKind(column('a', 'numeric'))).toBe('decimal');
    expect(getFieldKind(column('a', 'uuid'))).toBe('uuid');
    expect(
      getFieldKind(
        column('a', 'character varying', { ui: { max_length: 5000 } }),
      ),
    ).toBe('textarea');
    expect(getFieldKind(column('a', 'text'))).toBe('text');
  });
});

describe('getFormFields', () => {
  it('solo incluye columnas editables, ordenadas y sin las ocultas', () => {
    const fields = getFormFields(
      notificationColumns,
      relationColumns,
      new Set(['link']),
    );

    expect(fields.map((f) => f.column.name)).toEqual([
      'account_id',
      'type',
      'body',
      'dismissed',
      'expires_at',
    ]);
    expect(fields[0]!.kind).toBe('relation');
  });
});

describe('valores por defecto', () => {
  it('quita el cast y reconoce los dinámicos', () => {
    expect(stripTypeCast("'info'::public.notification_type")).toBe('info');
    expect(stripTypeCast("''::text")).toBe('');
    expect(parseStaticDefault("'info'::public.notification_type")).toBe('info');
    expect(parseStaticDefault('false')).toBe(false);
    expect(parseStaticDefault('0')).toBe(0);
    expect(parseStaticDefault('(-1)')).toBe(-1);
    expect(parseStaticDefault("'ab'::character varying(10)")).toBe('ab');
    expect(parseStaticDefault('now()')).toBeUndefined();
    expect(parseStaticDefault("(now() + '1 mon'::interval)")).toBeUndefined();
    expect(parseStaticDefault("nextval('seq'::regclass)")).toBeUndefined();
    expect(parseStaticDefault(null)).toBeUndefined();
  });

  it('al crear, un NOT NULL con valor por defecto no es obligatorio', () => {
    const type = notificationColumns[2]!;
    const body = notificationColumns[3]!;

    expect(isFieldRequired(type, 'create')).toBe(false);
    expect(isFieldRequired(type, 'edit')).toBe(true);
    expect(isFieldRequired(body, 'create')).toBe(true);
  });

  it('los valores iniciales al crear muestran los defectos literales', () => {
    const fields = getFormFields(notificationColumns, relationColumns);

    expect(getInitialFormValues(fields, null, 'UTC')).toEqual({
      account_id: '',
      type: 'info',
      body: '',
      link: '',
      dismissed: false,
      expires_at: '',
    });
  });
});

describe('createRecordFormSchema', () => {
  const fields = getFormFields(notificationColumns, relationColumns);

  const issues = (
    schema: ReturnType<typeof createRecordFormSchema>,
    values: Record<string, unknown>,
  ) => {
    const result = schema.safeParse(values);

    return result.success
      ? {}
      : Object.fromEntries(
          result.error.issues.map((issue) => [issue.path[0], issue.message]),
        );
  };

  const valid = {
    account_id: '5deaa894-2094-4da3-b4fd-1fada0809d1c',
    type: 'info',
    body: 'Hola',
    link: '',
    dismissed: false,
    expires_at: '',
  };

  it('acepta un registro válido', () => {
    expect(issues(createRecordFormSchema(fields, 'create'), valid)).toEqual({});
  });

  it('exige los obligatorios sin valor por defecto', () => {
    expect(
      issues(createRecordFormSchema(fields, 'create'), {
        ...valid,
        body: '',
        account_id: '',
      }),
    ).toEqual({ body: `${ERR}.required`, account_id: `${ERR}.required` });
  });

  it('al editar, no se puede vaciar un NOT NULL aunque tenga defecto', () => {
    expect(
      issues(createRecordFormSchema(fields, 'edit'), { ...valid, type: '' }),
    ).toEqual({ type: `${ERR}.required` });
  });

  it('valida longitud máxima, opciones y fechas', () => {
    expect(
      issues(createRecordFormSchema(fields, 'create'), {
        ...valid,
        link: 'x'.repeat(21),
        type: 'otro',
        expires_at: 'mañana',
      }),
    ).toEqual({
      link: `${ERR}.maxLength`,
      type: `${ERR}.invalidOption`,
      expires_at: `${ERR}.invalidDate`,
    });
  });

  it('valida números, UUID, JSON, correo y URL', () => {
    const typed = getFormFields(
      [
        column('n', 'integer'),
        column('d', 'numeric'),
        column('u', 'uuid'),
        column('j', 'jsonb'),
        column('a', 'ARRAY'),
        column('e', 'text', { ui: { ui_data_type: 'email' } }),
        column('w', 'text', { ui: { ui_data_type: 'url' } }),
        column('t', 'time without time zone'),
      ],
      new Set(),
    );

    const schema = createRecordFormSchema(typed, 'create');

    expect(
      issues(schema, {
        n: '1.5',
        d: 'abc',
        u: 'no-uuid',
        j: '{',
        a: '{}',
        e: 'correo',
        w: 'javascript:alert(1)',
        t: '25:00',
      }),
    ).toEqual({
      n: `${ERR}.invalidInteger`,
      d: `${ERR}.invalidNumber`,
      u: `${ERR}.invalidUuid`,
      j: `${ERR}.invalidJson`,
      a: `${ERR}.invalidArray`,
      e: `${ERR}.invalidEmail`,
      w: `${ERR}.invalidUrl`,
      t: `${ERR}.invalidTime`,
    });

    expect(
      issues(schema, {
        n: '-12',
        d: '3.14',
        u: '5deaa894-2094-4da3-b4fd-1fada0809d1c',
        j: '{"a": 1}',
        a: '["x"]',
        e: 'ana@pymekit.test',
        w: 'https://pymekit.test',
        t: '10:30',
      }),
    ).toEqual({});
  });
});

describe('conversión de valores', () => {
  it('de la base de datos al formulario', () => {
    expect(toFormValue('boolean', null, 'UTC')).toBeNull();
    expect(toFormValue('boolean', true, 'UTC')).toBe(true);
    expect(toFormValue('text', null, 'UTC')).toBe('');
    expect(toFormValue('integer', 42, 'UTC')).toBe('42');
    expect(toFormValue('json', { a: 1 }, 'UTC')).toBe('{\n  "a": 1\n}');
    expect(toFormValue('date', '2025-01-05', 'UTC')).toBe('2025-01-05');
    expect(toFormValue('time', '10:30:00', 'UTC')).toBe('10:30:00');
    expect(toFormValue('timestamp', '2025-01-05T10:30:00', 'UTC')).toBe(
      '2025-01-05T10:30:00',
    );
    expect(
      toFormValue('datetime', '2025-01-05T10:30:00+00:00', 'Europe/Madrid'),
    ).toBe('2025-01-05T11:30:00');
  });

  it('del formulario a la base de datos', () => {
    expect(toDatabaseValue('text', '', 'UTC')).toBeNull();
    expect(toDatabaseValue('boolean', false, 'UTC')).toBe(false);
    expect(toDatabaseValue('integer', ' 12 ', 'UTC')).toBe('12');
    expect(toDatabaseValue('json', '{"a":1}', 'UTC')).toEqual({ a: 1 });
    expect(toDatabaseValue('array', '["x"]', 'UTC')).toEqual(['x']);
    expect(toDatabaseValue('timestamp', '2025-01-05T10:30', 'UTC')).toBe(
      '2025-01-05T10:30:00',
    );
    expect(
      toDatabaseValue('datetime', '2025-01-05T11:30:00', 'Europe/Madrid'),
    ).toBe('2025-01-05T10:30:00.000Z');
  });
});

describe('campos modificados y cuerpo de la petición', () => {
  const fields = getFormFields(notificationColumns, relationColumns);

  const record = {
    id: 7,
    account_id: '5deaa894-2094-4da3-b4fd-1fada0809d1c',
    type: 'info',
    body: 'Hola',
    link: null,
    dismissed: false,
    expires_at: '2025-02-01T00:00:00+00:00',
  };

  const initial = getInitialFormValues(fields, record, 'UTC');

  it('`null` y vacío no cuentan como cambio', () => {
    expect(getDirtyFields(fields, initial, { ...initial, link: '' })).toEqual(
      [],
    );
  });

  it('al editar solo se envían los campos modificados', () => {
    const current = { ...initial, body: 'Adiós', link: 'https://x.test' };

    expect(getDirtyFields(fields, initial, current)).toEqual(['body', 'link']);

    expect(
      buildRecordPayload({
        fields,
        initial,
        current,
        mode: 'edit',
        timeZone: 'UTC',
      }),
    ).toEqual({ body: 'Adiós', link: 'https://x.test' });
  });

  it('al editar, vaciar un campo lo pone a null', () => {
    const current = { ...initial, link: '' };
    const withLink = { ...initial, link: 'https://x.test' };

    expect(
      buildRecordPayload({
        fields,
        initial: withLink,
        current,
        mode: 'edit',
        timeZone: 'UTC',
      }),
    ).toEqual({ link: null });
  });

  it('al crear omite lo que no se ha tocado y tiene valor por defecto', () => {
    const created = getInitialFormValues(fields, null, 'UTC');
    const current = {
      ...created,
      account_id: '5deaa894-2094-4da3-b4fd-1fada0809d1c',
      body: 'Nueva',
    };

    expect(
      buildRecordPayload({
        fields,
        initial: created,
        current,
        mode: 'create',
        timeZone: 'UTC',
      }),
    ).toEqual({
      account_id: '5deaa894-2094-4da3-b4fd-1fada0809d1c',
      body: 'Nueva',
    });
  });

  it('al crear añade los valores fijos (clave foránea de la relación)', () => {
    const hidden = getFormFields(
      notificationColumns,
      relationColumns,
      new Set(['account_id']),
    );
    const created = getInitialFormValues(hidden, null, 'UTC');

    expect(
      buildRecordPayload({
        fields: hidden,
        initial: created,
        current: { ...created, body: 'Hija', type: 'warning' },
        mode: 'create',
        timeZone: 'UTC',
        fixedValues: { account_id: 'abc' },
      }),
    ).toEqual({ body: 'Hija', type: 'warning', account_id: 'abc' });
  });
});

describe('getFieldPlaceholder', () => {
  it('explica el valor por defecto', () => {
    expect(getFieldPlaceholder(column('a', 'text'))).toEqual({
      key: 'record.placeholder.default',
      values: { name: 'a' },
    });
    expect(
      getFieldPlaceholder(
        column('id', 'uuid', { default_value: 'gen_random_uuid()' }),
      ),
    ).toEqual({ key: 'record.placeholder.uuid' });
    expect(
      getFieldPlaceholder(
        column('id', 'bigint', {
          default_value: "nextval('x_id_seq'::regclass)",
        }),
      ),
    ).toEqual({ key: 'record.placeholder.sequence' });
    expect(
      getFieldPlaceholder(column('c', 'timestamp', { default_value: 'now()' })),
    ).toEqual({ key: 'record.placeholder.now' });
    expect(
      getFieldPlaceholder(column('b', 'boolean', { default_value: 'true' })),
    ).toEqual({ key: 'record.placeholder.true' });
    expect(
      getFieldPlaceholder(
        column('t', 'text', { default_value: "'pendiente'::text" }),
      ),
    ).toEqual({ literal: 'pendiente' });
  });
});
