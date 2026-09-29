import * as z from 'zod';

export const TransferOwnershipConfirmationSchema = z.object({
  accountId: z.uuid(),
  userId: z.uuid(),
  otp: z.string().min(6),
});

export type TransferOwnershipConfirmationData = z.output<
  typeof TransferOwnershipConfirmationSchema
>;
