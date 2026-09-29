import * as z from 'zod';

export const PasswordUpdateSchema = {
  withTranslation: (errorMessage: string) => {
    return z
      .object({
        newPassword: z
          .string()
          .min(8, { message: 'auth.errors.minPasswordLength' })
          .max(99),
        repeatPassword: z
          .string()
          .min(8, { message: 'auth.errors.minPasswordLength' })
          .max(99),
      })
      .refine(
        (values) => {
          return values.newPassword === values.repeatPassword;
        },
        {
          path: ['repeatPassword'],
          message: errorMessage,
        },
      );
  },
};
