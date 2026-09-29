/**
 * Comprobación de acceso de la interfaz del CMS (`/admin/cms/**`).
 *
 * El `beforeLoad` del *layout* `/admin/cms` pide a la API del CMS la cuenta
 * del usuario (`GET /v1/account`). La respuesta decide qué ocurre:
 *
 *  - 200: acceso concedido; la cuenta y sus secciones se guardan en el
 *    contexto del *router* para las rutas hijas.
 *  - 401: la sesión ha caducado → inicio de sesión (con `next`).
 *  - 403 por MFA o cuenta del CMS inactiva → se devuelve un estado que el
 *    *layout* muestra como aviso con el enlace a la verificación en dos pasos.
 *  - Cualquier otro 403 → 404, como hace la consola con quien no es personal.
 *
 * La interfaz no decide nada por sí sola: se limita a reflejar lo que ya ha
 * decidido la API (y, por debajo, `cms.verify_admin_access()` y RLS).
 *
 * [TFG] RF-09 · RNF-02 · ADR-014: defensa en profundidad; la interfaz nunca es
 * la barrera de seguridad.
 */
import type { QueryClient } from '@tanstack/react-query';
import { notFound, redirect } from '@tanstack/react-router';

import { getCmsAccessFailure } from '@pymekit/cms-ui-core/errors';
import type {
  CmsSection,
  CmsSectionAccess,
} from '@pymekit/cms-ui-core/sections';

import pathsConfig from '#/config/paths.config.ts';

import { cmsQueries } from './cms-queries.ts';

/**
 * Resultado de la comprobación de acceso que ven las rutas del CMS en su
 * contexto. Solo lleva datos planos (TanStack Start serializa el contexto de
 * `beforeLoad` para hidratarlo en el navegador); la cuenta completa se lee de
 * la caché de TanStack Query con `useCmsAccount()`.
 */
export type CmsAccessState =
  | { status: 'ok'; access: CmsSectionAccess }
  | { status: 'mfa_or_inactive' };

/**
 * Carga (o reutiliza de la caché) la cuenta del CMS y la traduce a un
 * `CmsAccessState`, lanzando `redirect`/`notFound` cuando procede.
 *
 * @param params.href URL actual, para volver a ella tras iniciar sesión.
 * @throws `redirect` al inicio de sesión (401), `notFound` (otros 403) o el
 *   error original si no es de acceso (se muestra el `errorComponent`).
 */
export async function loadCmsAccess(params: {
  queryClient: QueryClient;
  href: string;
}): Promise<CmsAccessState> {
  try {
    const { access } = await params.queryClient.ensureQueryData(
      cmsQueries.account(),
    );

    return { status: 'ok', access };
  } catch (error) {
    const failure = getCmsAccessFailure(error);

    if (failure === 'unauthenticated') {
      throw redirect({
        href: `${pathsConfig.auth.signIn}?next=${encodeURIComponent(params.href)}`,
      });
    }

    if (failure === 'mfa_or_inactive') {
      return { status: 'mfa_or_inactive' };
    }

    if (failure === 'forbidden') {
      throw notFound();
    }

    throw error;
  }
}

/**
 * Exige que el usuario pueda usar una sección concreta del CMS.
 *
 * Se llama desde el `beforeLoad` de cada sección con permiso propio
 * (usuarios, almacenamiento, auditoría) para que escribir la URL a mano no
 * muestre una pantalla que la barra lateral oculta. Si el acceso general aún
 * no es válido (MFA), no hace nada: el *layout* ya muestra el aviso.
 */
export function requireCmsSection(
  cmsAccess: CmsAccessState,
  section: Extract<CmsSection, 'users' | 'storage' | 'auditLogs'>,
) {
  if (cmsAccess.status === 'ok' && !cmsAccess.access[section]) {
    throw notFound();
  }
}
