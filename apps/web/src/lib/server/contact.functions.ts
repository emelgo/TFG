/**
 * *Server function* pública del formulario de contacto de la web.
 *
 * Es uno de los pocos puntos de entrada que no exigen sesión, así que se
 * protege con CAPTCHA (si está configurado) y escapa todo lo que escribe el
 * visitante antes de meterlo en el correo.
 */
import { createServerFn } from '@tanstack/react-start';
import * as z from 'zod';

import { verifyCaptchaToken } from '@pymekit/auth/captcha/server';
import { errorMiddleware } from '@pymekit/function-middleware/server';
import { getMailer } from '@pymekit/mailers';

import { ContactEmailSchema } from '#/lib/contact/contact-email.schema.ts';

// Evita la inyección de HTML: quien envía el formulario controla `name`,
// `email` y `message`, que se insertan en el cuerpo del correo que recibe el
// propietario del sitio.
function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Envía el mensaje del formulario de contacto a `CONTACT_EMAIL` con el
 * proveedor de correo activo. Las variables de entorno se leen al llamar (no
 * al cargar el módulo) para que, si falta alguna, falle esa petición y no el
 * renderizado en servidor de toda la web.
 */
export const sendContactEmail = createServerFn({ method: 'POST' })
  // Se normalizan los errores para no enviar al navegador los mensajes
  // internos del proveedor de correo o del CAPTCHA.
  .middleware([errorMiddleware])
  .validator(ContactEmailSchema)
  .handler(async ({ data }) => {
    // Si hay CAPTCHA configurado, se verifica el token antes de enviar nada:
    // protege este punto público frente a abusos automatizados (inundar el
    // buzón o disparar el coste del proveedor de correo). Sin configuración no
    // hace nada.
    if (process.env.CAPTCHA_SECRET_TOKEN) {
      await verifyCaptchaToken(data.captchaToken ?? '');
    }

    const contactEmail = z
      .string({
        error:
          'Contact email is required. Please set the CONTACT_EMAIL environment variable.',
      })
      .parse(process.env.CONTACT_EMAIL);

    const emailFrom = z
      .string({
        error:
          'Sender email is required. Please set the EMAIL_SENDER environment variable.',
      })
      .parse(process.env.EMAIL_SENDER);

    const mailer = await getMailer();

    await mailer.sendEmail({
      to: contactEmail,
      from: emailFrom,
      subject: 'Contact Form Submission',
      html: `
        <p>You have received a new contact form submission.</p>
        <p>Name: ${escapeHtml(data.name)}</p>
        <p>Email: ${escapeHtml(data.email)}</p>
        <p>Message: ${escapeHtml(data.message)}</p>
      `,
    });

    return { success: true as const };
  });
