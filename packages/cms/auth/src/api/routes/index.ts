/**
 * *Middleware* de autenticación de la API del CMS.
 *
 * Se ejecuta antes de cualquier ruta `/v1/*` (salvo `/v1/health`) y decide si
 * la petición puede llegar a los servicios del CMS:
 *
 *  1. Lee la sesión de Supabase de las *cookies* (las mismas que usa la web,
 *     porque el CMS vive en el mismo servidor y dominio) y **verifica** el JWT
 *     con `getClaims()`. Sin sesión válida responde 401.
 *  2. Exige el *claim* `app_metadata.cms_access = 'true'`, que la base de datos
 *     solo concede al personal del CMS y a los super-admin (ADR-014). Sin él
 *     responde 403.
 *  3. Comprueba en Auth que el usuario no está bloqueado (`banned_until` no va
 *     en el JWT, así que un *token* emitido antes del bloqueo seguiría siendo
 *     válido hasta caducar).
 *
 * Si todo es correcto, deja el cliente Supabase verificado en el contexto
 * (`c.set('supabase', …)`) para que Drizzle ejecute las transacciones con ese
 * mismo *token*.
 *
 * Este filtro es solo la primera barrera: cada consulta vuelve a pasar por
 * `cms.verify_admin_access()` y por las políticas RLS del esquema `cms`, que
 * comprueban además que la cuenta del CMS está activa y que la sesión cumple
 * el requisito de MFA (aal2). Nunca se confía solo en este *middleware*.
 *
 * [TFG] RF-09 · RNF-02 · ADR-014: acceso al CMS integrado en la consola de
 * super-admin, con defensa en profundidad API + base de datos.
 */
import type { Context, Hono } from 'hono';

import {
  createSupabaseRequestClient,
  getSupabaseAdminClient,
} from '@pymekit/cms-supabase/hono';
import { getLogger } from '@pymekit/shared/logger';

/** Motivos por los que se rechaza una petición, con su código HTTP. */
const REJECTIONS = {
  not_authenticated: { status: 401, error: 'User is not logged in' },
  user_not_found: { status: 403, error: 'Your account was not found' },
  not_admin: { status: 403, error: 'You do not have admin access' },
  user_banned: { status: 403, error: 'Your account was banned' },
} as const;

type RejectionReason = keyof typeof REJECTIONS;

/** *Claims* del JWT de Supabase que usa el CMS. */
type CmsClaims = {
  sub: string;
  is_anonymous?: boolean;
  role: string;
  app_metadata?: {
    cms_access?: 'true' | 'false';
  };
  aal?: string;
};

/**
 * Registra el *middleware* de autenticación en el *router* del CMS.
 *
 * Debe registrarse después de las rutas públicas (`/v1/health`) y antes de
 * cualquier ruta protegida: Hono ejecuta los manejadores en orden de registro.
 */
export function registerAuthMiddleware(router: Hono) {
  return router.use('/v1/*', async (c, next) => {
    const result = await authenticate(c);

    if (!result.ok) {
      const { status, error } = REJECTIONS[result.reason];

      return c.json({ error }, status);
    }

    await next();
  });
}

/**
 * Verifica la sesión de la petición y devuelve el motivo del rechazo, si lo
 * hay. Cualquier error inesperado se trata como «sin sesión» (falla cerrado).
 */
async function authenticate(
  c: Context,
): Promise<{ ok: true } | { ok: false; reason: RejectionReason }> {
  const logger = await getLogger();

  try {
    const client = createSupabaseRequestClient(c);

    // `getClaims()` valida la firma del JWT (con las claves públicas del
    // proyecto o, si no hay, preguntando a Auth). No basta con decodificarlo.
    const { data, error } = await client.auth.getClaims();
    const claims = data?.claims as CmsClaims | undefined;

    if (error || !claims) {
      return { ok: false, reason: 'not_authenticated' };
    }

    if (claims.is_anonymous || claims.role !== 'authenticated') {
      return { ok: false, reason: 'user_not_found' };
    }

    if (claims.app_metadata?.cms_access !== 'true') {
      logger.warn({ userId: claims.sub }, 'CMS access denied: missing claim');

      return { ok: false, reason: 'not_admin' };
    }

    if (await isUserBanned(claims.sub)) {
      return { ok: false, reason: 'user_banned' };
    }

    // A partir de aquí todas las piezas de la petición usan este cliente, cuyo
    // *token* acabamos de verificar.
    c.set('supabase', client);

    return { ok: true };
  } catch (error) {
    logger.error({ error }, 'CMS authentication failed');

    return { ok: false, reason: 'not_authenticated' };
  }
}

/**
 * Comprueba en Auth si el usuario está bloqueado.
 *
 * Se usa el cliente administrador porque `banned_until` solo se puede leer con
 * la API de administración de Auth; la consulta se limita al propio usuario
 * de la sesión, ya verificado. Un error transitorio no bloquea al usuario: la
 * base de datos sigue aplicando sus propias comprobaciones.
 */
async function isUserBanned(userId: string) {
  if (!userId) {
    return false;
  }

  const logger = await getLogger();

  try {
    const adminClient = getSupabaseAdminClient();
    const { data, error } = await adminClient.auth.admin.getUserById(userId);

    if (error) {
      logger.error({ error }, 'Could not read the CMS user ban status');

      return false;
    }

    const bannedUntil = (data?.user as { banned_until?: string } | undefined)
      ?.banned_until;

    return Boolean(bannedUntil && new Date(bannedUntil) > new Date());
  } catch (error) {
    logger.error({ error }, 'Could not read the CMS user ban status');

    return false;
  }
}
