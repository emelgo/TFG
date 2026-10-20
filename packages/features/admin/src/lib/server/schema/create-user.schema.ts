import * as z from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email({ message: 'common.validation.invalidEmail' }),
  password: z
    .string()
    .min(8, { message: 'common.validation.passwordMinLength' }),
  emailConfirm: z.boolean().default(false).optional(),
});

export type CreateUserSchemaType = z.output<typeof CreateUserSchema>;
