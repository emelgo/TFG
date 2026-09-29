import { createTranslator } from 'use-intl';

import { defaultLocale } from '@pymekit/i18n/config';
import { getMessages } from '@pymekit/i18n/messages';

type Translator = (key: string, values?: Record<string, unknown>) => string;

/**
 * Build a translator for use OUTSIDE React render — specifically route `head()`
 * blocks that set the document `<title>` from the i18n catalog (the single
 * source of truth), instead of hardcoding English strings that drift from the
 * on-page `<Trans>` copy. Messages are bundled per locale, so this is
 * synchronous. Mirrors the drizzle sibling's `getTranslator`.
 */
export function getTranslator(locale: string = defaultLocale): Translator {
  return createTranslator({
    locale,
    messages: getMessages(locale),
  }) as unknown as Translator;
}
