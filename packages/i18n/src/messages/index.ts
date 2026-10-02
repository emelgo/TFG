import { defaultLocale } from '../config';
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
// que resolver un idioma es síncrono. Hoy solo hay español (ADR-021); si se
// añade un idioma, debe tener exactamente las mismas claves que `es` (lo
// comprueba el test `messages.test.ts`).
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
};

/** Catálogo de mensajes de un idioma; si no existe, el del idioma por defecto. */
export function getMessages(locale: string): Messages {
  return registry[locale] ?? registry[defaultLocale] ?? {};
}
