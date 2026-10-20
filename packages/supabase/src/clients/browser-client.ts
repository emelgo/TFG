import { createBrowserClient } from '@supabase/ssr';

import { type Database } from '../database.types';
import { getSupabaseClientKeys } from '../get-supabase-client-keys';

/**
 * Cliente de Supabase para el navegador.
 *
 * Usa la clave pública y la sesión del usuario guardada en *cookies*, así que
 * todas sus consultas están sujetas a la RLS. Normalmente no se llama
 * directamente: los componentes lo obtienen con el *hook* `useSupabase`.
 */
export function getSupabaseBrowserClient<GenericSchema = Database>() {
  const keys = getSupabaseClientKeys();

  return createBrowserClient<GenericSchema>(keys.url, keys.publicKey, {
    cookieOptions: {
      // Las cookies de sesión solo se marcan como Secure en producción (HTTPS),
      // para que el desarrollo local sobre http://localhost siga funcionando.
      // Debe coincidir con el cliente de servidor para que ambos escriban las
      // cookies con los mismos atributos.
      secure: process.env.NODE_ENV === 'production',
    },
    auth: {
      experimental: {
        // Activa las API experimentales de WebAuthn/passkeys
        // (`signInWithPasskey`, `registerPasskey`, `passkey.*`), que lanzan un
        // error si no se habilitan aquí. Que la interfaz las ofrezca o no lo
        // decide la opción `VITE_AUTH_PASSKEY` de auth.config.ts.
        passkey: true,
      },
    },
  });
}
