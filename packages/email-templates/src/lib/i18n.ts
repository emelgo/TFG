import type { AbstractIntlMessages } from 'use-intl';
import { createTranslator } from 'use-intl';

/** Idiomas en los que existen plantillas de correo (`locales/<idioma>/`). */
const EMAIL_LANGUAGES = ['es', 'en'];

/**
 * Idioma por defecto de los correos: el mismo que el del producto
 * (`VITE_DEFAULT_LOCALE`), y si no está definido o no es válido, español.
 */
const DEFAULT_EMAIL_LANGUAGE = EMAIL_LANGUAGES.includes(
  import.meta.env?.VITE_DEFAULT_LOCALE ?? '',
)
  ? (import.meta.env.VITE_DEFAULT_LOCALE as string)
  : 'es';

/**
 * Normaliza el idioma pedido por quien envía el correo: admite etiquetas como
 * `es-ES` y cae al idioma por defecto si no hay plantillas para ese idioma.
 */
export function resolveEmailLanguage(language: string | undefined | null) {
  const base = language?.toLowerCase().split('-')[0];

  return base && EMAIL_LANGUAGES.includes(base) ? base : DEFAULT_EMAIL_LANGUAGE;
}

export async function initializeEmailI18n(params: {
  language: string | undefined;
  namespace: string;
}) {
  const language = resolveEmailLanguage(params.language);

  try {
    // Load the translation messages for the specified namespace
    const messages = (await import(
      `../locales/${language}/${params.namespace}.json`
    )) as AbstractIntlMessages;

    // Create a translator function with the messages
    const translator = createTranslator({
      locale: language,
      messages,
    });

    // Type-cast to make it compatible with the i18next API
    const t = translator as unknown as (
      key: string,
      values?: Record<string, unknown>,
    ) => string;

    // Return an object compatible with the i18next API
    return {
      t,
      language,
    };
  } catch (error) {
    console.log(
      `Error loading i18n file: locales/${language}/${params.namespace}.json`,
      error,
    );

    // Return a fallback translator that returns the key as-is
    const t = (key: string) => key;

    return {
      t,
      language,
    };
  }
}
