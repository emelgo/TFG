import * as z from 'zod';

const isHostedMode = process.env.STRIPE_UI_MODE === 'hosted_page';

export const StripeClientEnvSchema = z
  .object({
    publishableKey: isHostedMode ? z.string().optional() : z.string().min(1),
  })
  .refine(
    (schema) => {
      if (isHostedMode || !schema.publishableKey) {
        return true;
      }

      return schema.publishableKey.startsWith('pk_');
    },
    {
      path: ['publishableKey'],
      message: `Stripe publishable key must start with 'pk_'`,
    },
  );
