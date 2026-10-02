import { defaultLocale } from '../config';
import enAccount from './en/account.json';
import enAdmin from './en/admin.json';
import enAuth from './en/auth.json';
import enBilling from './en/billing.json';
import enCms from './en/cms.json';
import enCommon from './en/common.json';
import enMarketing from './en/marketing.json';
import enTeams from './en/teams.json';
import esAccount from './es/account.json';
import esAdmin from './es/admin.json';
import esAuth from './es/auth.json';
import esBilling from './es/billing.json';
import esCms from './es/cms.json';
import esCommon from './es/common.json';
import esMarketing from './es/marketing.json';
import esTeams from './es/teams.json';

export type Messages = Record<string, Record<string, unknown>>;

// Catálogo de mensajes por idioma. Los ficheros se empaquetan con la app, así
// que resolver un idioma es síncrono. `es` y `en` deben tener exactamente las
// mismas claves (lo comprueba el test `messages.test.ts`).
export const registry: Record<string, Messages> = {
  es: {
    common: esCommon,
    auth: esAuth,
    account: esAccount,
    teams: esTeams,
    billing: esBilling,
    marketing: esMarketing,
    cms: esCms,
    admin: esAdmin,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    account: enAccount,
    teams: enTeams,
    billing: enBilling,
    marketing: enMarketing,
    cms: enCms,
    admin: enAdmin,
  },
};

/** Resolve the message catalog for a locale, falling back to the default. */
export function getMessages(locale: string): Messages {
  return registry[locale] ?? registry[defaultLocale] ?? {};
}
