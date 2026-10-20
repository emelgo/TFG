import * as z from 'zod';

/**
 * Entrada del formulario de contacto. Los límites de longitud acotan el
 * tamaño del correo que se genera, porque el formulario es público.
 */
export const ContactEmailSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.email(),
  message: z.string().min(1).max(5000),
  captchaToken: z.string().optional(),
});

export type ContactEmail = z.infer<typeof ContactEmailSchema>;
