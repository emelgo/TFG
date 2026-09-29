import { defaultLocale } from '../config';
import enAccount from './en/account.json';
import enAuth from './en/auth.json';
import enBilling from './en/billing.json';
import enCommon from './en/common.json';
import enMarketing from './en/marketing.json';
import enTeams from './en/teams.json';

export type Messages = Record<string, Record<string, unknown>>;

const registry: Record<string, Messages> = {
  en: {
    common: enCommon,
    auth: enAuth,
    account: enAccount,
    teams: enTeams,
    billing: enBilling,
    marketing: enMarketing,
  },
};

/** Resolve the message catalog for a locale, falling back to the default. */
export function getMessages(locale: string): Messages {
  return registry[locale] ?? registry[defaultLocale] ?? {};
}
