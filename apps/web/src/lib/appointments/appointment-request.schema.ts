/**
 * Esquema Zod de una solicitud de cita (formulario público «Pedir cita»).
 *
 * Es la única definición de las reglas del formulario y la comparten el
 * navegador (validación al enviar, con los mensajes en el campo) y la
 * *server function* (validación de lo que llega por la red, que es lo que de
 * verdad protege la tabla). Las restricciones `check` de
 * `schemas/56-appointment-requests.sql` repiten las básicas en la BD.
 *
 * Los mensajes de error son claves i18n: `FieldError` de `@pymekit/ui/field`
 * las traduce, así que aquí no hay texto visible.
 *
 * [TFG] RNF-01 · CU-07: escenario de evaluación «Fisioterapia Bahía».
 */
import * as z from 'zod';

/** Servicios de la clínica, en el mismo orden que el enumerado de la BD. */
export const APPOINTMENT_SERVICES = [
  'physiotherapy',
  'sports_injury',
  'back_pain',
  'pelvic_floor',
  'rehabilitation',
] as const;

/** Cuántos días por delante se puede pedir cita. */
export const MAX_DAYS_AHEAD = 90;

const ERRORS = 'marketing.appointments.errors';

/** Fecha `AAAA-MM-DD` desplazada `days` días respecto a hoy (hora local). */
export function isoDateFromToday(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

export const AppointmentRequestSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, { message: `${ERRORS}.fullNameRequired` })
    .max(150),
  email: z.email({ message: `${ERRORS}.emailInvalid` }).max(320),
  // Prefijo internacional opcional y entre 9 y 15 dígitos, con espacios
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{9,19}$/, { message: `${ERRORS}.phoneInvalid` })
    .refine((value) => value.replace(/\D/g, '').length >= 9, {
      message: `${ERRORS}.phoneInvalid`,
    }),
  service: z.enum(APPOINTMENT_SERVICES, {
    message: `${ERRORS}.serviceRequired`,
  }),
  // Las fechas `AAAA-MM-DD` se comparan bien como texto. Se admite «ayer»
  // como margen para que la diferencia horaria entre el navegador y el
  // servidor no rechace una cita pedida para hoy.
  preferredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: `${ERRORS}.dateRequired` })
    .refine((value) => value >= isoDateFromToday(-1), {
      message: `${ERRORS}.dateInPast`,
    })
    .refine((value) => value <= isoDateFromToday(MAX_DAYS_AHEAD), {
      message: `${ERRORS}.dateTooFar`,
    }),
  message: z.string().trim().max(1000).optional(),
  // Consentimiento obligatorio: la clínica trata datos de salud (RGPD)
  privacyAccepted: z.boolean().refine((accepted) => accepted, {
    message: `${ERRORS}.privacyRequired`,
  }),
  captchaToken: z.string().optional(),
});

export type AppointmentRequest = z.infer<typeof AppointmentRequestSchema>;
