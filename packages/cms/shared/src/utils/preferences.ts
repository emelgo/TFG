/**
 * Reglas de las preferencias personales del CMS (zona horaria).
 *
 * Las preferencias se guardan en `cms.accounts.preferences` (JSONB) y la zona
 * horaria decide cómo se muestran todas las fechas del CMS
 * (`FormatterPreferencesProvider`). Una zona horaria desconocida haría fallar
 * `Intl.DateTimeFormat` en cada celda, así que se valida en los dos lados:
 * en la interfaz, para avisar antes de enviar, y en la API, que es la
 * autoridad. Son funciones puras sin dependencias, por eso viven en
 * `@pymekit/cms-shared` y pueden llegar al navegador.
 *
 * [TFG] RF-09 · F2.7a.
 */

/** Longitud máxima de un identificador de zona horaria IANA. */
const MAX_TIME_ZONE_LENGTH = 64;

/** Forma de un nombre de zona IANA: `UTC` o `Región/Ciudad[/…]`. */
const CANONICAL_TIME_ZONE = /^(?:UTC|[A-Z][A-Za-z]*(?:\/[A-Za-z0-9_+-]+)+)$/;

/**
 * Indica si `value` es una zona horaria IANA que el motor de JavaScript
 * reconoce (`Europe/Madrid`, `UTC`…). Se comprueba creando un formateador,
 * que es lo que después hará la interfaz con ella.
 */
export function isValidTimeZone(value: string) {
  // Solo nombres IANA con su forma canónica (`UTC` o `Región/Ciudad`): el
  // motor del servidor también acepta desfases (`+01:00`) o minúsculas, que
  // algunos navegadores rechazan y romperían todas las fechas del CMS.
  if (
    !value ||
    value.length > MAX_TIME_ZONE_LENGTH ||
    !CANONICAL_TIME_ZONE.test(value)
  ) {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });

    return true;
  } catch {
    return false;
  }
}

/**
 * Combina las preferencias guardadas con las nuevas. Las claves que no se
 * envían se conservan (el código de partida sustituía el objeto entero).
 * Así sobreviven claves antiguas como `language`, que ya no se edita ni se
 * lee: la interfaz solo está en español (ADR-021).
 */
export function mergeCmsPreferences(
  current: unknown,
  update: { timezone?: string },
) {
  const base =
    current && typeof current === 'object' && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};

  return {
    ...base,
    ...(update.timezone !== undefined ? { timezone: update.timezone } : {}),
  };
}
