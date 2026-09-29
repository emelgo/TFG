import * as z from 'zod';

import { PlanSchema } from '../create-billing-schema';

export const CreateBillingCheckoutSchema = z.object({
  returnUrl: z.url(),
  accountId: z.uuid(),
  plan: PlanSchema,
  customerId: z.string().optional(),
  customerEmail: z.email().optional(),
  enableDiscountField: z.boolean().optional(),
  variantQuantities: z.array(
    z.object({
      variantId: z.string().min(1),
      quantity: z.number(),
    }),
  ),
  metadata: z.record(z.string(), z.string()).optional(),
});
