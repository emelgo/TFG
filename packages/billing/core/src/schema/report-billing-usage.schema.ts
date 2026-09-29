import * as z from 'zod';

export const ReportBillingUsageSchema = z.object({
  id: z.string().min(1),
  eventName: z.string().optional(),
  usage: z.object({
    // metered usage must be a non-negative integer: this prevents a caller
    // from under-reporting (negative/fractional) usage if this schema is ever
    // wired up to a client-facing entry point.
    quantity: z.number().int().nonnegative(),
    action: z.enum(['increment', 'set']).optional(),
  }),
});
