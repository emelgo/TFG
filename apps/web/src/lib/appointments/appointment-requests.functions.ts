/**
 * *Server function* pública del formulario «Pedir cita».
 *
 * Es la única puerta de entrada a `public.appointment_requests` desde la
 * web: la tabla no concede nada a `anon` ni a `authenticated` (ver
 * `schemas/56-appointment-requests.sql`), así que un visitante no puede
 * escribir en ella hablando directamente con la API de datos.
 *
 * Por qué el cliente administrador (`service_role`, ignora RLS): la
 * alternativa era conceder INSERT a `anon` con una política RLS, lo que
 * ampliaría la superficie pública de la BD (hoy solo la lectura del blog,
 * ADR-017). A cambio, aquí se acota todo lo que el cliente administrador
 * podría hacer:
 *
 *  - solo INSERT, sin leer nada de vuelta (`returning` mínimo);
 *  - solo las columnas que rellena el visitante, ya validadas con Zod; el
 *    estado y las notas internas no se aceptan nunca del formulario;
 *  - CAPTCHA si está configurado, igual que el formulario de contacto;
 *  - `errorMiddleware` y un mensaje genérico: ningún error de la BD llega
 *    tal cual al navegador.
 *
 * [TFG] RNF-01 · RNF-02 · CU-07: escenario de evaluación «Fisioterapia Bahía».
 */
import { createServerFn } from '@tanstack/react-start';

import { verifyCaptchaToken } from '@pymekit/auth/captcha/server';
import { errorMiddleware } from '@pymekit/function-middleware/server';
import { getLogger } from '@pymekit/shared/logger';
import { getSupabaseServerAdminClient } from '@pymekit/supabase/server-admin-client';

import { AppointmentRequestSchema } from './appointment-request.schema';

/**
 * Registra una solicitud de cita en estado «pendiente» para que el personal
 * de la clínica la gestione desde el CMS (área «Citas»).
 */
export const submitAppointmentRequestFunction = createServerFn({
  method: 'POST',
})
  .middleware([errorMiddleware])
  .validator(AppointmentRequestSchema)
  .handler(async ({ data }) => {
    // Sin CAPTCHA configurado (desarrollo, E2E) la comprobación no se hace
    if (process.env.CAPTCHA_SECRET_TOKEN) {
      await verifyCaptchaToken(data.captchaToken ?? '');
    }

    const client = getSupabaseServerAdminClient();

    const { error } = await client.from('appointment_requests').insert({
      full_name: data.fullName,
      email: data.email,
      phone: data.phone,
      service: data.service,
      preferred_date: data.preferredDate,
      message: data.message || null,
    });

    if (error) {
      const logger = await getLogger();

      logger.error(
        { error, name: 'appointments.submit' },
        'Failed to store appointment request',
      );

      throw new Error('The appointment request could not be saved');
    }

    return { success: true as const };
  });
