import * as z from 'zod';

export const CreateBillingPortalSessionSchema = z.object({
  returnUrl: z.url(),
  customerId: z.string().min(1),
});
