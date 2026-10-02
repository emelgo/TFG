/** Prefijo de los valores de fecha relativa (`__rel_date:today`). */
export const RELATIVE_DATE_PREFIX = '__rel_date:';

/** Tipos de columna que se filtran como fechas. */
export const DATE_DATA_TYPES = [
  'date',
  'timestamp',
  'timestamp with time zone',
] as const;

/** Indica si un tipo de dato de PostgreSQL es de fecha. */
export function isDateDataType(dataType: string | undefined) {
  return DATE_DATA_TYPES.includes(dataType as (typeof DATE_DATA_TYPES)[number]);
}
