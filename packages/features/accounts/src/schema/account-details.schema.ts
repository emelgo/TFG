import * as z from 'zod';

export const AccountDetailsSchema = z.object({
  displayName: z.string().min(2, { message: 'account.nameMinLength' }).max(100),
});
