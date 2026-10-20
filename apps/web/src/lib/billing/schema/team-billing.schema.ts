import * as z from 'zod';

/** Entrada del portal de facturación de un equipo. */
export const TeamBillingPortalSchema = z.object({
  accountId: z.uuid(),
  slug: z.string().min(1),
});

/**
 * Entrada para crear el pago de un equipo. `accountId` es obligatorio porque
 * lo leen las guardas de permiso del middleware.
 */
export const TeamCheckoutSchema = z.object({
  slug: z.string().min(1),
  productId: z.string().min(1),
  planId: z.string().min(1),
  accountId: z.uuid(),
});
