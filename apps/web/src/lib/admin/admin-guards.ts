/**
 * Guardas de navegación de la consola de administración (`/admin`).
 *
 * Desde la integración del CMS (ADR-014) a la consola entran dos perfiles:
 *
 *  - el **super-admin** de la plataforma (rol `super-admin` y sesión aal2),
 *    que ve las páginas de la plataforma (panel y cuentas) y el CMS completo;
 *  - el **personal del CMS** (*claim* `cms_access`), que solo ve el CMS con
 *    los permisos de su rol.
 *
 * Estas guardas solo deciden la navegación. Los datos de la plataforma se
 * siguen protegiendo en el servidor con `adminFunctionMiddleware` (exige
 * super-admin) y los del CMS con la API del CMS y RLS.
 *
 * [TFG] RF-08 · RF-09 · ADR-014.
 */
import { redirect } from '@tanstack/react-router';

import type { JWTUserData } from '@pymekit/supabase/types';

/** Portada del CMS, destino del personal que no es super-admin. */
export const CMS_HOME_PATH = '/admin/cms';

/**
 * Exige super-admin en una página de la plataforma. El personal del CMS que
 * llega a ella (por ejemplo, escribiendo la URL) se redirige al CMS en lugar
 * de recibir un error, porque la consola sí es suya.
 */
export function requirePlatformAdmin(user: JWTUserData | null) {
  if (!user?.is_superadmin) {
    throw redirect({ to: CMS_HOME_PATH });
  }
}
