import * as z from 'zod';

export const DeleteTeamAccountSchema = z.object({
  accountId: z.uuid(),
  otp: z.string().min(1),
});
