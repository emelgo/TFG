/**
 * Fechas de los gráficos de demostración del panel del equipo (F3b).
 *
 * Los datos de ejemplo traen la fecha como texto `YYYY-MM-DD`. Estas
 * funciones puras la convierten y la formatean en el idioma activo; viven
 * aparte del componente para poder probarlas sin React.
 */

/**
 * Convierte la fecha de los datos de ejemplo (`YYYY-MM-DD`) en un `Date`
 * local. `new Date('2024-04-01')` la interpreta en UTC (y en husos negativos
 * sale el día anterior) y `new Date(Number('2024-04-01'))` da «Invalid
 * Date», que era el fallo del *tooltip* (F3b).
 */
export function parseDemoDate(value: unknown) {
  if (value instanceof Date) return value;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));

  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  const date = new Date(typeof value === 'number' ? value : String(value));

  return Number.isNaN(date.getTime()) ? null : date;
}

/** Formatea una fecha de los gráficos en el idioma activo. */
export function formatDemoDate(
  value: unknown,
  locale: string,
  options: Intl.DateTimeFormatOptions,
) {
  const date = parseDemoDate(value);

  return date ? date.toLocaleDateString(locale, options) : String(value ?? '');
}
