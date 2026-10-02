/**
 * Conversión entre instantes (`timestamp with time zone`) y el valor de un
 * `<input type="datetime-local">`.
 *
 * Un `timestamptz` es un instante absoluto (la API lo devuelve en ISO 8601
 * con su desfase), pero el control del navegador trabaja con una fecha y hora
 * «de pared» sin zona. El formulario muestra esa hora en la zona horaria de
 * las preferencias del CMS (la misma con la que se formatean las fechas en
 * el listado y la ficha, UTC por defecto) y, al guardar, la vuelve a
 * convertir en un instante. Así lo que se ve y lo que se guarda coinciden
 * aunque el navegador esté en otra zona.
 */
import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

const LOCAL_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Devuelve el valor para el control (`yyyy-MM-ddTHH:mm:ss`) de un instante
 * visto en `timeZone`, o `''` si el valor no es una fecha válida.
 */
export function toDateTimeInputValue(value: string, timeZone: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return format(new TZDate(date.getTime(), timeZone), "yyyy-MM-dd'T'HH:mm:ss");
}

/**
 * Convierte el valor del control, interpretado como hora de `timeZone`, en
 * un instante ISO 8601 en UTC. Devuelve `null` si el valor no tiene el
 * formato del control.
 */
export function fromDateTimeInputValue(value: string, timeZone: string) {
  const match = value.match(LOCAL_DATE_TIME);

  if (!match) {
    return null;
  }

  const [, year, month, day, hours, minutes, seconds = '0'] = match;

  const date = new TZDate(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
    timeZone,
  );

  const time = date.getTime();

  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** `true` si el texto tiene el formato del control `datetime-local`. */
export function isDateTimeInputValue(value: string) {
  return LOCAL_DATE_TIME.test(value);
}
