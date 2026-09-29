import * as z from 'zod';

export const RemoveMemberSchema = z.object({
  accountId: z.uuid(),
  userId: z.uuid(),
});
