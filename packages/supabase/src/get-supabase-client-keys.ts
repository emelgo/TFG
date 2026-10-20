import * as z from 'zod';

/**
 * Devuelve y valida la URL y la clave pública de Supabase.
 *
 * Son variables públicas con el prefijo `VITE_`, que Vite incrusta en el
 * código tanto del cliente como del servidor. La clave pública no es un
 * secreto: lo que protege los datos es la RLS.
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
