/**
 * Contexto de formateo (idioma y zona horaria) de la interfaz del CMS.
 *
 * Los formateadores de fechas y números necesitan saber en qué idioma y en qué
 * zona horaria mostrar los valores:
 *
 *  - **Idioma:** el de la interfaz de la web (`use-intl`), para que las cifras
 *    y las fechas de las tablas usen las mismas convenciones que el resto de
 *    textos de la pantalla.
 *  - **Zona horaria:** la preferencia personal del CMS, que publica el
 *    *layout* `/admin/cms` con `FormatterPreferencesProvider`. Este paquete no
 *    lee la cuenta del CMS directamente: también lo usa el servidor y no debe
 *    depender del núcleo de la interfaz (se crearía un ciclo entre paquetes).
 *    Si no hay preferencia se usa UTC y no la zona del navegador a propósito:
 *    las tablas se renderizan primero en el servidor (SSR) y después se
 *    hidratan; con una zona fija las dos pasadas producen el mismo texto y
 *    React no detecta diferencias al hidratar.
 */
import { createContext, useContext, useMemo } from 'react';

import { useLocale } from 'use-intl';

import {
  DEFAULT_FORMATTER_CONTEXT,
  type FormatterContext,
} from '../formatters';

type FormatterPreferences = { timezone?: string };

const FormatterPreferencesContext = createContext<FormatterPreferences>({});

/** Publica la zona horaria del usuario para los formateadores. */
export function FormatterPreferencesProvider(
  props: React.PropsWithChildren<{ timezone?: string }>,
) {
  const value = useMemo(() => ({ timezone: props.timezone }), [props.timezone]);

  return (
    <FormatterPreferencesContext.Provider value={value}>
      {props.children}
    </FormatterPreferencesContext.Provider>
  );
}

/**
 * Devuelve el contexto de formateo del usuario actual del CMS.
 */
export function useFormatterContext(): FormatterContext {
  const locale = useLocale();
  const { timezone } = useContext(FormatterPreferencesContext);

  return useMemo(
    () => ({
      ...DEFAULT_FORMATTER_CONTEXT,
      locale: locale || DEFAULT_FORMATTER_CONTEXT.locale,
      timezone: timezone || DEFAULT_FORMATTER_CONTEXT.timezone,
    }),
    [locale, timezone],
  );
}
