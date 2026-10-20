/**
 * Esquemas Zod de los formularios del explorador de usuarios.
 *
 * Los mensajes son claves i18n (`FieldError` las traduce). La API vuelve a
 * validar el cuerpo con su propio esquema estricto; estos solo sirven para
 * avisar antes de enviar.
 */
import * as z from 'zod';

export const CreateUserSchema = z.object({
  email: z.email('cms.usersExplorer.form.emailInvalid'),
  password: z
    .string()
    .min(8, 'cms.usersExplorer.form.passwordTooShort')
    .max(72, 'cms.usersExplorer.form.passwordTooLong')
    .regex(/[A-Z]/, 'cms.usersExplorer.form.passwordUppercase')
    .regex(/[a-z]/, 'cms.usersExplorer.form.passwordLowercase')
    .regex(/\d/, 'cms.usersExplorer.form.passwordNumber'),
  autoConfirm: z.boolean(),
});

export const InviteUserSchema = z.object({
  email: z.email('cms.usersExplorer.form.emailInvalid'),
});

/**
 * Esquema de la confirmación escrita de una acción destructiva: hay que
 * teclear exactamente `word` (por ejemplo, `ELIMINAR`).
 */
export function createConfirmationSchema(word: string) {
  return z.object({
    confirmText: z
      .string()
      .refine(
        (value) => value === word,
        'cms.usersExplorer.confirm.textDoesNotMatch',
      ),
  });
}
