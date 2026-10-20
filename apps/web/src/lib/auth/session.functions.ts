/**
 * *Server function* que identifica al usuario en cada navegación.
 */
import { createServerFn } from '@tanstack/react-start';

import { getSupabaseServerClient } from '@pymekit/supabase/server-client';
import type { JWTUserData } from '@pymekit/supabase/types';

export type Session = JWTUserData | null;

/**
 * Lee la identidad del JWT con `getClaims()` (y NO con `getUser()`, que
 * consultaría a Auth en cada petición). Se ejecuta en el `beforeLoad` raíz; el
 * cliente de servidor, que escribe *cookies*, guarda el *refresh token*
 * renovado en cada navegación completa, así que este es el único punto donde
 * se refresca la sesión.
 *
 * Si no hay sesión devuelve `null` (nunca lanza), para que la web cargue sin
 * problemas para los visitantes anónimos. La conversión es la misma que la de
 * `requireUser`, de modo que las guardas comparten la forma `JWTUserData`.
 * La comprobación de que la sesión sigue existiendo la hace `fetchAuthGate`
 * en las zonas privadas.
 */
export const fetchSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Session> => {
    const client = getSupabaseServerClient();
    const { data, error } = await client.auth.getClaims();

    if (error || !data?.claims) {
      return null;
    }

    const claims = data.claims;
    const role = claims.app_metadata?.role;

    return {
      id: claims.sub,
      email: claims.email,
      phone: claims.phone,
      aal: claims.aal,
      amr: claims.amr,
      is_superadmin: role === 'super-admin' && claims.aal === 'aal2',
      // Acceso al CMS (ADR-014): solo el *claim*. No se exige aal2 aquí para
      // que la consola pueda mostrar al personal sin MFA verificado el aviso
      // de verificación en dos pasos en lugar de un 404.
      has_cms_access: claims.app_metadata?.cms_access === 'true',
      is_anonymous: claims.is_anonymous ?? false,
    };
  },
);
