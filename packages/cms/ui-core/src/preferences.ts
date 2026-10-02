/**
 * Preferencias personales del usuario en el CMS (idioma y zona horaria).
 *
 * Se guardan en `cms.accounts.preferences` (JSONB) y llegan con la cuenta en
 * `GET /v1/account`. Como el JSONB no tiene tipo, aquí se leen con cuidado:
 * cualquier valor ausente o con otro tipo se ignora en lugar de romper el
 * formateo de fechas y números de las tablas.
 */
import { isValidTimeZone } from '@pymekit/cms-shared/preferences';

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
    // Una zona no válida (guardada antes de validarla en la API, o escrita a
    // mano en la BD) haría fallar cada formateador de fechas: se ignora y se
    // usa la de por defecto (UTC).
    timezone:
      typeof timezone === 'string' && isValidTimeZone(timezone)
        ? timezone
        : undefined,
  };
}
