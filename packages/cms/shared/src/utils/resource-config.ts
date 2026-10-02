/**
 * Reglas compartidas de Ajustes > Recursos del CMS (F2.7c): límites de los
 * textos configurables, identificadores válidos y tipos de interfaz
 * («formateadores») que se pueden asignar a una columna según su tipo de
 * PostgreSQL.
 *
 * Vive en `@pymekit/cms-shared` porque lo usan a la vez los esquemas Zod de
 * la API (`@pymekit/cms-settings`), que rechazan cualquier valor fuera de
 * estas listas, y los formularios de la interfaz (`@pymekit/cms-settings-ui`),
 * que solo ofrecen las opciones válidas. Es un módulo puro, sin
 * dependencias, seguro en el *bundle* del navegador.
 *
 * [TFG] RF-09 · RNF-02: la configuración de una tabla no admite JSON libre,
 * solo las formas documentadas aquí.
 */

/** Límites de longitud y tamaño de la configuración de recursos. */
export const RESOURCE_CONFIG_LIMITS = {
  displayName: 255,
  description: 2000,
  displayFormat: 500,
  ordering: 100_000,
  /** Tablas que se pueden reordenar u ocultar en una sola petición. */
  tablesPerUpdate: 500,
  /** Columnas que se pueden actualizar en una sola petición. */
  columnsPerUpdate: 500,
  relationsPerUpdate: 100,
  sectionLabel: 100,
  booleanLabel: 100,
  /** Texto visible de un valor de enumerado (`ui_config.value_labels`). */
  valueLabel: 100,
  uiConfigEntries: 20,
  uiConfigValue: 500,
  enumBadges: 200,
  /** Distribución de la ficha: grupos, filas por grupo y campos por fila. */
  layoutGroups: 20,
  layoutRowsPerGroup: 50,
  layoutColumnsPerRow: 4,
  layoutId: 64,
  layoutLabel: 100,
} as const;

/**
 * Identificador de PostgreSQL que la API acepta como esquema, tabla o
 * columna: letras, dígitos, `_` y `$`, sin empezar por dígito, hasta 63
 * caracteres (el límite de PostgreSQL). Descarta comillas, puntos y espacios
 * antes de llegar a la base de datos.
 */
export const PG_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;

/** Indica si un texto es un identificador aceptado por la API. */
export function isValidPgIdentifier(value: string) {
  return PG_IDENTIFIER_PATTERN.test(value);
}

const TEXT_TYPES = [
  'text',
  'longtext',
  'email',
  'url',
  'color',
  'markdown',
  'html',
  'phone',
  'file',
  'image',
  'audio',
  'video',
] as const;

const NUMBER_TYPES = ['number', 'currency', 'percentage'] as const;
const DATE_TYPES = ['date', 'datetime', 'time'] as const;

/** Todos los tipos de interfaz que se pueden guardar en `ui_data_type`. */
export const UI_DATA_TYPES = [
  ...TEXT_TYPES,
  ...NUMBER_TYPES,
  ...DATE_TYPES,
  'code',
  'switch',
  'uuid',
] as const;

export type UiDataType = (typeof UI_DATA_TYPES)[number];

/**
 * Tipos de interfaz que tienen sentido para un tipo de PostgreSQL. Un
 * enumerado o un tipo desconocido no admite cambios (lista vacía): se
 * muestra con su formato por defecto.
 */
export function getUiDataTypeOptions(pgType: string | null | undefined) {
  const type = (pgType ?? '').toLowerCase();

  if (!type || type.includes('user-defined') || type.includes('[]')) {
    return [] as UiDataType[];
  }

  if (type === 'boolean') {
    return ['switch'] as UiDataType[];
  }

  if (type === 'uuid') {
    return ['uuid'] as UiDataType[];
  }

  if (type === 'json' || type === 'jsonb') {
    return ['code'] as UiDataType[];
  }

  if (
    type === 'date' ||
    type.startsWith('timestamp') ||
    type.startsWith('time')
  ) {
    return [...DATE_TYPES] as UiDataType[];
  }

  if (
    ['integer', 'smallint', 'bigint', 'numeric', 'decimal', 'real'].includes(
      type,
    ) ||
    type.startsWith('double') ||
    type.startsWith('float')
  ) {
    return [...NUMBER_TYPES] as UiDataType[];
  }

  if (type === 'text' || type.startsWith('character')) {
    return [...TEXT_TYPES] as UiDataType[];
  }

  return [] as UiDataType[];
}
