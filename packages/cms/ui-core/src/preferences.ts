/**
 * Preferencias personales del usuario en el CMS (idioma y zona horaria).
 *
 * Se guardan en `cms.accounts.preferences` (JSONB) y llegan con la cuenta en
 * `GET /v1/account`. Como el JSONB no tiene tipo, aquí se leen con cuidado:
 * cualquier valor ausente o con otro tipo se ignora en lugar de romper el
 * formateo de fechas y números de las tablas.
 */

/** Preferencias válidas del usuario del CMS. */
export type CmsPreferences = {
  language?: string;
  timezone?: string;
};

/**
 * Extrae las preferencias de la cuenta del CMS, descartando las que no sean
 * cadenas no vacías.
 */
export function getCmsPreferences(preferences: unknown): CmsPreferences {
  if (!preferences || typeof preferences !== 'object') {
    return {};
  }

  const { language, timezone } = preferences as Record<string, unknown>;

  return {
    language:
      typeof language === 'string' && language.length > 0
        ? language
        : undefined,
    timezone:
      typeof timezone === 'string' && timezone.length > 0
        ? timezone
        : undefined,
  };
}
