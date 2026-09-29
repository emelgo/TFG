import type { AbstractIntlMessages } from 'use-intl';
import { createTranslator } from 'use-intl';

export async function initializeEmailI18n(params: {
  language: string | undefined;
  namespace: string;
}) {
  const language = params.language ?? 'en';

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
