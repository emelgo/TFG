/**
 * Formulario de Ajustes > General: esquema de validación y zonas horarias.
 *
 * La zona horaria se valida igual que en la API (`isValidTimeZone` de
 * `@pymekit/cms-shared/preferences`), para avisar antes de enviar; la API
 * vuelve a validarla. Los mensajes son claves i18n (`FieldError` las
 * traduce).
 */
import * as z from 'zod';

import {
  isValidLanguageTag,
  isValidTimeZone,
} from '@pymekit/cms-shared/preferences';

export const GeneralSettingsSchema = z.object({
  language: z
    .string()
    .refine(isValidLanguageTag, 'cms.settings.general.errors.invalidLanguage'),
  timezone: z
    .string()
    .refine(isValidTimeZone, 'cms.settings.general.errors.invalidTimezone'),
});

export type GeneralSettingsValues = z.infer<typeof GeneralSettingsSchema>;

/** Zona horaria por defecto del CMS (la misma que usan los formateadores). */
export const DEFAULT_CMS_TIME_ZONE = 'UTC';

/**
 * Zonas horarias que ofrece el selector: las que reconoce el motor
 * (`Intl.supportedValuesOf`) con `UTC` siempre incluida. Si el motor no
 * permite enumerarlas, al menos se ofrecen `UTC` y la actual.
 */
export function getSelectableTimeZones(current?: string) {
  const zones = new Set<string>([DEFAULT_CMS_TIME_ZONE]);

  const supportedValuesOf = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;

  for (const zone of supportedValuesOf?.('timeZone') ?? []) {
    zones.add(zone);
  }

  if (current && isValidTimeZone(current)) {
    zones.add(current);
  }

  return [...zones].sort((a, b) =>
    a === DEFAULT_CMS_TIME_ZONE
      ? -1
      : b === DEFAULT_CMS_TIME_ZONE
        ? 1
        : a.localeCompare(b),
  );
}
