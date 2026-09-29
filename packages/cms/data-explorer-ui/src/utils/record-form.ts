/**
 * Lógica pura del formulario de un registro (crear y editar).
 *
 * El formulario del explorador no se escribe a mano para cada tabla: se
 * construye a partir del metadato de sus columnas (`cms.table_metadata`):
 * qué columnas son editables, de qué tipo son, si son obligatorias, su valor
 * por defecto y su longitud máxima. Este módulo reúne todo lo que no depende
 * de React, para poder probarlo:
 *
 *  1. **Tipo de control** (`getFieldKind`): interruptor, desplegable,
 *     selector de fecha, editor JSON, selector de clave foránea…
 *  2. **Valor del formulario** (`toFormValue`): el valor de la base de datos
 *     se convierte a lo que maneja el control (texto, booleano o `null`).
 *  3. **Validación** (`createRecordFormSchema`): un esquema Zod por columna.
 *     Sus mensajes son claves i18n (`FieldError` las traduce).
 *  4. **Envío** (`buildRecordPayload`): solo viajan las columnas modificadas
 *     (en la edición) o con valor (en la creación), convertidas de nuevo al
 *     tipo de la base de datos.
 *
 * La validación del cliente es solo una ayuda: la función SQL vuelve a
 * comprobar el tipo de cada valor y descarta las columnas no editables.
 *
 * [TFG] RF-09: edición de registros del CMS a partir de metadatos.
 */
import * as z from 'zod';

import type { ColumnMetadata } from '@pymekit/cms-types';

import {
  fromDateTimeInputValue,
  isDateTimeInputValue,
  toDateTimeInputValue,
} from './datetime-input';

/** Modo del formulario. */
export type RecordFormMode = 'create' | 'edit';

/** Tipo de control con el que se edita una columna. */
export type FieldKind =
  | 'relation'
  | 'boolean'
  | 'enum'
  | 'json'
  | 'array'
  | 'date'
  | 'datetime'
  | 'timestamp'
  | 'time'
  | 'integer'
  | 'decimal'
  | 'uuid'
  | 'email'
  | 'url'
  | 'color'
  | 'textarea'
  | 'text';

/** Valor de un campo en el formulario: texto, o booleano/`null` (interruptor). */
export type FormFieldValue = string | boolean | null;

/** Valores del formulario, por nombre de columna. */
export type RecordFormValues = Record<string, FormFieldValue>;

/** Columna editable junto con su tipo de control. */
export type FormField = {
  column: ColumnMetadata;
  kind: FieldKind;
};

/** Prefijo de las claves i18n de los errores de validación. */
const ERRORS = 'cms.dataExplorer.record.form.errors';

const INTEGER_TYPES = new Set([
  'integer',
  'int',
  'int2',
  'int4',
  'int8',
  'bigint',
  'smallint',
  'serial',
  'bigserial',
]);

const DECIMAL_TYPES = new Set([
  'numeric',
  'decimal',
  'real',
  'double precision',
  'float',
  'float4',
  'float8',
]);

const TIMESTAMPTZ_TYPES = new Set(['timestamp with time zone', 'timestamptz']);

const TIMESTAMP_TYPES = new Set(['timestamp', 'timestamp without time zone']);

const INTEGER_PATTERN = /^-?\d+$/;
const DECIMAL_PATTERN = /^-?\d*\.?\d+(?:e[+-]?\d+)?$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/**
 * Decide el control de una columna. Primero la relación (una clave foránea
 * se elige de la tabla destino), después el tipo de interfaz configurado en
 * los ajustes del recurso (`ui_data_type`) y, por último, el tipo de
 * PostgreSQL.
 */
export function getFieldKind(
  column: ColumnMetadata,
  isRelation = false,
): FieldKind {
  if (isRelation) {
    return 'relation';
  }

  const uiType = column.ui_config?.ui_data_type?.toLowerCase() ?? '';
  const pgType = column.ui_config?.data_type?.toLowerCase() ?? '';

  if (uiType === 'switch' || pgType === 'boolean') {
    return 'boolean';
  }

  if (column.ui_config?.is_enum && column.ui_config.enum_values?.length) {
    return 'enum';
  }

  if (pgType === 'json' || pgType === 'jsonb') {
    return 'json';
  }

  if (pgType === 'array' || pgType.endsWith('[]')) {
    return 'array';
  }

  if (uiType === 'email') {
    return 'email';
  }

  if (uiType === 'url') {
    return 'url';
  }

  if (uiType === 'color') {
    return 'color';
  }

  if (pgType === 'date') {
    return 'date';
  }

  if (TIMESTAMPTZ_TYPES.has(pgType)) {
    return 'datetime';
  }

  if (TIMESTAMP_TYPES.has(pgType)) {
    return 'timestamp';
  }

  if (pgType.startsWith('time')) {
    return 'time';
  }

  if (INTEGER_TYPES.has(pgType)) {
    return 'integer';
  }

  if (DECIMAL_TYPES.has(pgType) || uiType === 'number') {
    return 'decimal';
  }

  if (pgType === 'uuid') {
    return 'uuid';
  }

  const maxLength = column.ui_config?.max_length ?? 0;

  if (['longtext', 'markdown', 'html'].includes(uiType) || maxLength > 255) {
    return 'textarea';
  }

  return 'text';
}

/**
 * Columnas que aparecen en el formulario: solo las editables según el
 * metadato (la base de datos rechaza el resto de todos modos), en el orden
 * configurado y sin las que fija quien abre el formulario (`hidden`, por
 * ejemplo la clave foránea al crear un registro relacionado).
 */
export function getFormFields(
  columns: ColumnMetadata[],
  relationColumns: ReadonlySet<string>,
  hidden: ReadonlySet<string> = new Set(),
): FormField[] {
  return columns
    .filter((column) => column.is_editable && !hidden.has(column.name))
    .sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))
    .map((column) => ({
      column,
      kind: getFieldKind(column, relationColumns.has(column.name)),
    }));
}

/**
 * Quita el *cast* de un valor por defecto de PostgreSQL:
 * `'activo'::text` → `activo`, `'{}'::jsonb` → `{}`.
 */
export function stripTypeCast(value: unknown): string {
  if (typeof value !== 'string') {
    return String(value);
  }

  const match = value.match(/^(['"])(.*)\1::[\w\s.[\](),-]+$/);

  return match ? String(match[2]) : value;
}

/**
 * `true` si el valor por defecto se calcula en la base de datos (una
 * función como `now()` o `gen_random_uuid()`, o una secuencia): el
 * formulario no puede adivinarlo y lo deja vacío para que lo ponga el
 * servidor.
 */
export function isDynamicDefault(defaultValue: string | null | undefined) {
  const raw = defaultValue?.trim().toLowerCase() ?? '';

  // Cualquier llamada a función (también dentro de una expresión, como
  // `(now() + '1 mon'::interval)`) o las constantes SQL de fecha y hora.
  return (
    /(^|[^\w'])[a-z_][\w.]*\s*\(/.test(raw) ||
    /^\(?\s*(current_|localtime)/.test(raw)
  );
}

/**
 * Valor por defecto literal de una columna ya convertido al tipo de
 * JavaScript (`'info'::type` → `'info'`, `true` → `true`, `0` → `0`), o
 * `undefined` si no tiene o es dinámico.
 */
export function parseStaticDefault(defaultValue: string | null | undefined) {
  const raw = defaultValue?.trim() ?? '';

  if (raw === '' || raw.toLowerCase() === 'null') {
    return undefined;
  }

  // Un literal con *cast* (`'abc'::character varying(10)`) es estático
  // aunque el tipo lleve paréntesis.
  const literal = stripTypeCast(raw);

  if (literal !== raw) {
    return literal;
  }

  if (isDynamicDefault(raw)) {
    return undefined;
  }

  if (raw === 'true' || raw === 'false') {
    return raw === 'true';
  }

  // PostgreSQL escribe los negativos entre paréntesis: `(-1)`.
  const number = Number(raw.replace(/^\((.*)\)$/, '$1'));

  return Number.isNaN(number) ? raw : number;
}

/** `true` si la base de datos rellena la columna cuando no se envía. */
export function hasDatabaseDefault(column: ColumnMetadata) {
  return Boolean(column.default_value?.trim());
}

/**
 * `true` si el campo debe tener valor. Al crear, una columna `NOT NULL` con
 * valor por defecto puede quedar vacía (lo pone la base de datos); al
 * editar no se puede dejar vacía.
 */
export function isFieldRequired(column: ColumnMetadata, mode: RecordFormMode) {
  if (!column.is_required) {
    return false;
  }

  return mode === 'edit' || !hasDatabaseDefault(column);
}

/**
 * Convierte el valor de la base de datos (tal como lo devuelve la API) al
 * valor del control. `timeZone` es la zona de las preferencias del CMS.
 */
export function toFormValue(
  kind: FieldKind,
  value: unknown,
  timeZone: string,
): FormFieldValue {
  if (kind === 'boolean') {
    if (value === null || value === undefined) {
      return null;
    }

    return value === true || value === 'true';
  }

  if (value === null || value === undefined) {
    return '';
  }

  switch (kind) {
    case 'json':
    case 'array':
      return typeof value === 'string' ? value : JSON.stringify(value, null, 2);

    case 'datetime':
      return toDateTimeInputValue(String(value), timeZone);

    case 'timestamp':
      return String(value).replace(' ', 'T').slice(0, 19);

    case 'date':
      return String(value).slice(0, 10);

    case 'time':
      return String(value).slice(0, 8);

    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}

/**
 * Valores iniciales del formulario. Al editar, los del registro; al crear,
 * los valores por defecto literales de cada columna (para que el usuario vea
 * qué se guardará) y, si no tiene, vacío.
 */
export function getInitialFormValues(
  fields: FormField[],
  record: Record<string, unknown> | null,
  timeZone: string,
): RecordFormValues {
  const values: RecordFormValues = {};

  for (const { column, kind } of fields) {
    if (record) {
      values[column.name] = toFormValue(kind, record[column.name], timeZone);
      continue;
    }

    const staticDefault = parseStaticDefault(column.default_value);

    if (kind === 'boolean') {
      values[column.name] =
        typeof staticDefault === 'boolean'
          ? staticDefault
          : column.is_required
            ? false
            : null;

      continue;
    }

    values[column.name] =
      staticDefault === undefined
        ? ''
        : toFormValue(kind, staticDefault, timeZone);
  }

  return values;
}

/** `true` si el campo está vacío (texto vacío o `null`). */
export function isBlankValue(value: FormFieldValue | undefined) {
  return value === null || value === undefined || value === '';
}

/**
 * Comprueba el formato de un valor no vacío según su tipo de control.
 * Devuelve la clave i18n del error, o `null` si es válido.
 */
export function validateFieldValue(
  field: FormField,
  value: string,
): string | null {
  const { column, kind } = field;
  const trimmed = value.trim();

  switch (kind) {
    case 'integer':
      return INTEGER_PATTERN.test(trimmed) ? null : `${ERRORS}.invalidInteger`;

    case 'decimal':
      return DECIMAL_PATTERN.test(trimmed) ? null : `${ERRORS}.invalidNumber`;

    case 'uuid':
      return UUID_PATTERN.test(trimmed) ? null : `${ERRORS}.invalidUuid`;

    case 'email':
      return z.email().safeParse(trimmed).success
        ? null
        : `${ERRORS}.invalidEmail`;

    case 'url':
      return isHttpUrl(trimmed) ? null : `${ERRORS}.invalidUrl`;

    case 'color':
      return COLOR_PATTERN.test(trimmed) ? null : `${ERRORS}.invalidColor`;

    case 'json':
      return parseJson(value).ok ? null : `${ERRORS}.invalidJson`;

    case 'array': {
      const parsed = parseJson(value);

      return parsed.ok && Array.isArray(parsed.value)
        ? null
        : `${ERRORS}.invalidArray`;
    }

    case 'date':
      return DATE_PATTERN.test(trimmed) &&
        !Number.isNaN(new Date(trimmed).getTime())
        ? null
        : `${ERRORS}.invalidDate`;

    case 'datetime':
    case 'timestamp':
      return isDateTimeInputValue(trimmed) ? null : `${ERRORS}.invalidDate`;

    case 'time':
      return TIME_PATTERN.test(trimmed) ? null : `${ERRORS}.invalidTime`;

    case 'enum':
      return (column.ui_config.enum_values ?? []).includes(value)
        ? null
        : `${ERRORS}.invalidOption`;

    default: {
      const maxLength = column.ui_config?.max_length;

      return maxLength && value.length > maxLength
        ? `${ERRORS}.maxLength`
        : null;
    }
  }
}

/**
 * Esquema Zod de un campo, sobre el valor del control. Los mensajes son
 * claves i18n completas, que `FieldError` traduce.
 */
export function createFieldSchema(field: FormField, mode: RecordFormMode) {
  const required = isFieldRequired(field.column, mode);

  if (field.kind === 'boolean') {
    return z
      .boolean()
      .nullable()
      .refine((value) => !required || value !== null, {
        message: `${ERRORS}.required`,
      });
  }

  return z.string().superRefine((value, context) => {
    if (value === '') {
      if (required) {
        context.addIssue({ code: 'custom', message: `${ERRORS}.required` });
      }

      return;
    }

    const error = validateFieldValue(field, value);

    if (error) {
      context.addIssue({ code: 'custom', message: error });
    }
  });
}

/** Esquema Zod de todo el formulario (una entrada por campo). */
export function createRecordFormSchema(
  fields: FormField[],
  mode: RecordFormMode,
) {
  const shape: Record<string, z.ZodType<FormFieldValue, FormFieldValue>> = {};

  for (const field of fields) {
    shape[field.column.name] = createFieldSchema(field, mode);
  }

  return z.object(shape);
}

/**
 * Convierte el valor del control al que se envía a la API. Los números viajan
 * como texto para no perder precisión (`bigint`); la función SQL los
 * convierte al tipo de la columna. Un campo vacío es `null`.
 */
export function toDatabaseValue(
  kind: FieldKind,
  value: FormFieldValue,
  timeZone: string,
): unknown {
  if (isBlankValue(value)) {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const text = value as string;

  switch (kind) {
    case 'json':
    case 'array':
      return JSON.parse(text);

    case 'datetime':
      return fromDateTimeInputValue(text, timeZone);

    case 'timestamp':
      return text.length === 16 ? `${text}:00` : text;

    case 'integer':
    case 'decimal':
    case 'uuid':
      return text.trim();

    default:
      return text;
  }
}

/** `true` si el valor del campo ha cambiado respecto al inicial. */
export function isFieldDirty(
  initial: FormFieldValue | undefined,
  current: FormFieldValue | undefined,
) {
  // `''` y `null` son el mismo «vacío» para el usuario.
  if (isBlankValue(initial) && isBlankValue(current)) {
    return false;
  }

  return initial !== current;
}

/** Nombres de los campos modificados. */
export function getDirtyFields(
  fields: FormField[],
  initial: RecordFormValues,
  current: RecordFormValues,
) {
  return fields
    .map((field) => field.column.name)
    .filter((name) => isFieldDirty(initial[name], current[name]));
}

/**
 * Construye el cuerpo que se envía a la API.
 *
 *  - **Editar:** solo las columnas modificadas; vaciar un campo lo pone a
 *    `null`.
 *  - **Crear:** las columnas con valor que el usuario ha tocado o que no
 *    tienen valor por defecto en la base de datos. Las que se dejan como
 *    estaban se omiten, para que la base de datos aplique su valor por
 *    defecto (incluidos los dinámicos, como `now()`).
 *
 * `fixedValues` se añade tal cual (por ejemplo, la clave foránea al crear un
 * registro relacionado desde otra ficha).
 */
export function buildRecordPayload(params: {
  fields: FormField[];
  initial: RecordFormValues;
  current: RecordFormValues;
  mode: RecordFormMode;
  timeZone: string;
  fixedValues?: Record<string, unknown>;
}) {
  const { fields, initial, current, mode, timeZone } = params;
  const payload: Record<string, unknown> = {};

  for (const { column, kind } of fields) {
    const value = current[column.name] ?? null;
    const dirty = isFieldDirty(initial[column.name], value);

    if (mode === 'edit') {
      if (dirty) {
        payload[column.name] = toDatabaseValue(kind, value, timeZone);
      }

      continue;
    }

    if (isBlankValue(value)) {
      continue;
    }

    if (dirty || !hasDatabaseDefault(column)) {
      payload[column.name] = toDatabaseValue(kind, value, timeZone);
    }
  }

  return { ...payload, ...params.fixedValues };
}

/**
 * Texto de ayuda de un campo según su valor por defecto: una clave i18n (con
 * sus valores) o el literal del valor por defecto.
 */
export type FieldPlaceholder =
  | { key: string; values?: Record<string, string> }
  | { literal: string };

/** Funciones de PostgreSQL que generan un UUID. */
const UUID_FUNCTIONS = [
  'gen_random_uuid()',
  'uuid_generate_v4()',
  'extensions.uuid_generate_v4()',
  'uuid_generate_v1()',
];

const TIMESTAMP_FUNCTIONS = [
  'now()',
  'current_timestamp',
  'current_date',
  'current_time',
];

/**
 * Explica al usuario qué pasará si deja el campo vacío: «Se generará
 * automáticamente», «Por defecto: fecha actual», el literal por defecto…
 */
export function getFieldPlaceholder(column: ColumnMetadata): FieldPlaceholder {
  const raw = column.default_value ?? '';
  const def = raw.trim().toLowerCase();
  const name = column.display_name || column.name;
  const dataType = column.ui_config?.data_type?.toLowerCase() ?? '';

  if (!def || def === "''" || def === 'null') {
    return { key: 'record.placeholder.default', values: { name } };
  }

  if (def === 'true' || def === 'false') {
    return { key: `record.placeholder.${def}` };
  }

  if (
    UUID_FUNCTIONS.includes(def) ||
    (dataType === 'uuid' && /^[a-z_][\w.]*\(.*\)$/.test(def))
  ) {
    return { key: 'record.placeholder.uuid' };
  }

  if (/^nextval\(.+\)$/.test(def)) {
    return { key: 'record.placeholder.sequence' };
  }

  if (TIMESTAMP_FUNCTIONS.includes(def) || def.startsWith('(now()')) {
    return { key: 'record.placeholder.now' };
  }

  if (/::jsonb?$/.test(def) && def.startsWith("'")) {
    return { key: 'record.placeholder.json' };
  }

  if (/^[a-z_][\w.]*\(.*\)$/.test(def)) {
    return { key: 'record.placeholder.generated' };
  }

  return { literal: stripTypeCast(raw.trim()) };
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseJson(value: string): { ok: boolean; value?: unknown } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}
