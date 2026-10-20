import * as z from 'zod';

/**
 * Entrada para crear el pago de la cuenta personal: solo el producto y el
 * plan; la cuenta sale de la sesión.
 */
export const PersonalAccountCheckoutSchema = z.object({
  planId: z.string().min(1),
  productId: z.string().min(1),
});
