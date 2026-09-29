import * as z from 'zod';

import { PasswordSchema } from './password.schema';

export const PasswordSignInSchema = z.object({
  email: z.email({ message: 'auth.errors.invalidEmail' }),
  password: PasswordSchema,
});
