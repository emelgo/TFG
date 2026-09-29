import * as z from 'zod';

export const LeaveTeamAccountSchema = z.object({
  accountId: z.uuid(),
  confirmation: z.custom((value) => value === 'LEAVE'),
});
