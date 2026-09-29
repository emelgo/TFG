import * as z from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address' }),
  password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters' }),
  emailConfirm: z.boolean().default(false).optional(),
});

export type CreateUserSchemaType = z.output<typeof CreateUserSchema>;
