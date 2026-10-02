/**
 * *Hook* para formatear fechas con `date-fns` en la zona horaria del usuario.
 *
 * `date-fns` no gestiona zonas horarias por sí mismo: la fecha se envuelve en
 * un `TZDate` de `@date-fns/tz` para que el patrón (`dd MMM yyyy, HH:mm`) se
 * aplique en la zona elegida y no en la del proceso que renderiza.
 */
import { useCallback } from 'react';

import { TZDate } from '@date-fns/tz';
import { type FormatOptions, format as formatDate } from 'date-fns';

import { useFormatterContext } from './formatter-provider';

/**
 * Devuelve una función que formatea una fecha con un patrón de `date-fns` en
 * la zona horaria del usuario. Una fecha no válida se muestra como «-».
 */
export function useDateFormatter() {
  const { timezone } = useFormatterContext();

  return useCallback(
    (date: Date, pattern = 'LLL, dd MMM yyyy', options: FormatOptions = {}) => {
      if (Number.isNaN(date.getTime())) {
        return '-';
      }

      return formatDate(new TZDate(date, timezone), pattern, options);
    },
    [timezone],
  );
}
