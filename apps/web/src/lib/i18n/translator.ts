import { createTranslator } from 'use-intl';

import { defaultLocale } from '@pymekit/i18n/config';
import { getMessages } from '@pymekit/i18n/messages';

type Translator = (key: string, values?: Record<string, unknown>) => string;

/**
 * Crea un traductor para usar FUERA del renderizado de React, en concreto en
 * los `head()` de las rutas que fijan el `<title>` desde el catálogo i18n. Así
 * el catálogo es la única fuente de los textos y el título no se desincroniza
 * del contenido de la página. Los mensajes van empaquetados por idioma, por lo
 * que es síncrono.
 */
export function getTranslator(locale: string = defaultLocale): Translator {
  return createTranslator({
    locale,
    messages: getMessages(locale),
  }) as unknown as Translator;
}
