import * as z from 'zod';

export const RoleSchema = z.object({
  role: z.string().min(1),
});

export const UpdateMemberRoleSchema = RoleSchema.extend({
  accountId: z.uuid(),
  userId: z.uuid(),
});
