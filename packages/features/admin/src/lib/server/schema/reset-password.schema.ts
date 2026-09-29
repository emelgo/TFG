import * as z from 'zod';

/**
 * Schema for resetting a user's password
 */
export const ResetPasswordSchema = z.object({
  userId: z.uuid(),
  confirmation: z.custom<string>((value) => value === 'CONFIRM'),
});
