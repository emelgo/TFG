import * as z from 'zod';

export const UpdateEmailSchema = {
  withTranslation: (errorMessage: string) => {
    return z
      .object({
        email: z.email(),
        repeatEmail: z.email(),
      })
      .refine(
        (values) => {
          return values.email === values.repeatEmail;
        },
        {
          path: ['repeatEmail'],
          message: errorMessage,
        },
      );
  },
};
