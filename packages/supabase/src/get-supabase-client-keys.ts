import * as z from 'zod';

/**
 * Returns and validates the Supabase client keys from the environment.
 * Public vars use the VITE_ prefix and are inlined by Vite (client + server).
 */
export function getSupabaseClientKeys() {
  return z
    .object({
      url: z.string({
        error: `Please provide the variable VITE_SUPABASE_URL`,
      }),
      publicKey: z.string({
        error: `Please provide the variable VITE_SUPABASE_PUBLIC_KEY`,
      }),
    })
    .parse({
      url: import.meta.env.VITE_SUPABASE_URL,
      publicKey: import.meta.env.VITE_SUPABASE_PUBLIC_KEY,
    });
}
