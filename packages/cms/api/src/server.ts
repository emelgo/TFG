/**
 * API del CMS: aplicación Hono que agrupa todas las rutas del CMS.
 *
 * El CMS no es un servicio aparte: su API se monta dentro del servidor de la
 * web, en `/api/cms/*`, desde la ruta de servidor de TanStack Start
 * `apps/web/src/routes/api/cms/$.ts` (ADR-011). Este módulo construye la
 * aplicación Hono y registra, en este orden:
 *
 *  1. `GET /v1/health`: comprobación de salud pública (sin sesión).
 *  2. Cabeceras de seguridad y protección CSRF propias de la API.
 *  3. El *middleware* de autenticación (`@pymekit/cms-auth/routes`), que
 *     exige sesión válida y el *claim* `cms_access`.
 *  4. El contexto de cada petición: cliente Drizzle con los *claims* del
 *     usuario y servicio de autorización.
 *  5. Las rutas de cada funcionalidad (`@pymekit/cms-<funcionalidad>/routes`).
 *
 * Solo debe importarse desde código de servidor: arrastra Drizzle, el driver
 * de Postgres y la clave secreta de Supabase.
 *
 * [TFG] RF-09 · ADR-011: CMS integrado en la web como una API Hono montada en
 * una ruta de servidor.
 */
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';

import {
  registerAuditLogDetailsRoute,
  registerAuditLogsRoute,
  registerMemberAuditLogsRoute,
} from '@pymekit/cms-audit-logs/routes';
import { registerAuthMiddleware } from '@pymekit/cms-auth/routes';
import { createAuthorizationService } from '@pymekit/cms-auth/services';
import { registerDashboardRoutes } from '@pymekit/cms-dashboards/routes';
import { registerDataExplorerRoutes } from '@pymekit/cms-data-explorer/routes';
import { registerNavigationRoutes } from '@pymekit/cms-navigation/routes';
import { registerPermissionsRoutes } from '@pymekit/cms-permissions/routes';
import { registerResourcesRoutes } from '@pymekit/cms-resources/routes';
import {
  registerActivateMemberRouter,
  registerDeactivateMemberRouter,
  registerGetAccountRoute,
  registerGetMemberDetailsRouter,
  registerGetMembersRouter,
  registerMfaConfigurationRouter,
  registerSaveLayoutRouter,
  registerSyncManagedTablesRouter,
  registerTablesMetadataManagementRouter,
  registerUpdateMemberRolesRouter,
  registerUpdatePreferencesRouter,
  registerUpdateRelationsConfigRoute,
  registerUpdateTableColumnsConfigRouter,
  registerUpdateTableMetadataRouter,
  registerUpdateTablesRouter,
} from '@pymekit/cms-settings/routes';
import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import {
  registerBucketContentsRouter,
  registerFileOperationsRouter,
  registerStorageBucketsRouter,
} from '@pymekit/cms-storage-explorer/routes';
import { getDrizzleSupabaseClient } from '@pymekit/cms-supabase/client';
import { registerUsersExplorerRoutes } from '@pymekit/cms-users-explorer/routes';
import { getLogger } from '@pymekit/shared/logger';

/** Ruta en la que la web monta la API del CMS. */
export const CMS_API_BASE_PATH = '/api/cms';

/**
 * Crea el *router* de la API del CMS con todas sus rutas bajo `/v1/*`.
 *
 * Las rutas son relativas (`/v1/...`); `createCmsApiApp()` lo monta bajo
 * `/api/cms`. Se separa así para poder probar el *router* sin prefijo.
 */
export function createCmsApiRouter() {
  const router = new Hono();

  // Comprobación de salud pública. Va antes que cualquier *middleware*: Hono
  // ejecuta los manejadores en orden de registro y este responde sin llamar a
  // `next()`, así que no exige sesión. No expone la versión del paquete.
  router.get('/v1/health', (c) => {
    return c.json({ status: 'ok' });
  });

  // Cabeceras de seguridad. El *middleware* global de la web
  // (`apps/web/src/start.ts`) añade `X-Frame-Options`, `X-Content-Type-Options`,
  // `Referrer-Policy` y, en producción, HSTS, pero el servidor HTTP subyacente
  // solo las fusiona en las respuestas 2xx: un 401/403/500 de esta API saldría
  // sin ellas. Por eso se fijan también aquí, con los MISMOS valores que la web
  // (así la fusión no produce valores contradictorios), junto con las que la
  // web no pone (aislamiento de origen: COOP, CORP, `Origin-Agent-Cluster`…).
  router.use(
    secureHeaders({
      xFrameOptions: 'DENY',
      referrerPolicy: 'strict-origin-when-cross-origin',
      strictTransportSecurity:
        process.env['NODE_ENV'] === 'production'
          ? 'max-age=31536000; includeSubDomains'
          : false,
    }),
  );

  // Protección CSRF. El *middleware* CSRF de la web (`createCsrfMiddleware` en
  // `apps/web/src/start.ts`) solo filtra las *server functions*, así que NO
  // cubre `/api/cms/*`: se mantiene el de Hono, que rechaza envíos de
  // formulario (métodos no seguros) cuyo `Origin` no sea el de la web.
  //
  // CORS, en cambio, se elimina: la interfaz del CMS se sirve desde el mismo
  // origen que la API, y sin cabeceras CORS el navegador impide que otra web
  // lea las respuestas. Tampoco se comprime aquí (lo hace el servidor o el
  // proxy de despliegue) ni se usa el *logger* de Hono, que escribe con
  // `console.log`; los errores se registran con `getLogger()`.
  router.use(
    csrf({
      origin: (origin, c) => isSameOrigin(origin, c.req.url),
    }),
  );

  // Errores no controlados: se registran y se devuelve un mensaje genérico,
  // sin detalles internos. Las `HTTPException` (por ejemplo, el 403 del
  // *middleware* CSRF) conservan su código y su respuesta.
  router.onError(async (error, c) => {
    if (error instanceof HTTPException) {
      return error.getResponse();
    }

    const logger = await getLogger();

    logger.error({ error, path: c.req.path }, 'Unhandled CMS API error');

    return c.json({ error: 'Internal server error' }, 500);
  });

  // Autenticación: sesión válida + claim `cms_access`. Deja en el contexto el
  // cliente Supabase verificado.
  registerAuthMiddleware(router);

  // Contexto de cada petición autenticada: cliente Drizzle que ejecuta las
  // transacciones con los *claims* del usuario (RLS) y servicio de
  // autorización. Se registra DESPUÉS de la autenticación para que Drizzle use
  // exactamente el *token* que acaba de verificarse.
  router.use('/v1/*', async (c, next) => {
    try {
      const drizzle = await getDrizzleSupabaseClient(c);

      // [TFG] RNF-02 · ADR-014/015: además del claim, se pide a la base de
      // datos la comprobación completa de acceso (cuenta del CMS activa y MFA
      // si es obligatorio). Sin esto, una sesión sin segundo factor recibía
      // 200 con listas vacías (las políticas RLS lo ocultaban todo); ahora se
      // rechaza de forma explícita con 403, más claro para la interfaz.
      const hasAdminAccess = await drizzle.runTransaction(async (tx) => {
        const rows = (await tx.execute(
          sql`select cms.verify_admin_access() as ok`,
        )) as unknown as Array<{ ok: boolean | null }>;

        return rows[0]?.ok === true;
      });

      if (!hasAdminAccess) {
        // `errorCode` permite a la interfaz distinguir este caso (se puede
        // resolver verificando el segundo factor) de un 403 definitivo.
        return c.json(
          {
            error:
              'CMS access requires an active CMS account and, if enabled, MFA',
            errorCode: CMS_API_ERROR_CODES.MFA_OR_INACTIVE_ACCOUNT,
          },
          403,
        );
      }

      c.set('drizzle', drizzle);
      c.set('authorization', createAuthorizationService(c));
    } catch (error) {
      const logger = await getLogger();

      // Falla cerrado: sin contexto de autorización no se atiende la petición.
      logger.error({ error }, 'Could not initialize the CMS request context');

      return c.json(
        {
          error: 'Internal server error',
          message: 'Request could not be processed',
        },
        500,
      );
    }

    await next();
  });

  registerFeatureRoutes(router);

  return router;
}

/**
 * Crea la aplicación Hono completa, con el *router* del CMS montado en
 * `/api/cms`. Es lo que invoca la ruta de servidor de la web.
 */
export function createCmsApiApp() {
  return new Hono().route(CMS_API_BASE_PATH, createCmsApiRouter());
}

/**
 * Registra las rutas de todas las funcionalidades del CMS.
 *
 * Para añadir un *endpoint* nuevo se crea la función `registerXRoute(router)`
 * en el paquete de la funcionalidad (export `./routes`) y se llama aquí.
 */
function registerFeatureRoutes(router: Hono) {
  // Roles y permisos del RBAC del CMS: listas de roles y, desde F2.7b, la
  // única implementación de Ajustes > Permisos (`/v1/permissions/**`).
  registerPermissionsRoutes(router);

  // Explorador de datos y paneles
  registerDataExplorerRoutes(router);
  registerDashboardRoutes(router);

  // Navegación y recursos legibles por el usuario
  registerNavigationRoutes(router);
  registerResourcesRoutes(router);

  // Ajustes: metadatos de tablas
  registerUpdateTablesRouter(router);
  registerSyncManagedTablesRouter(router);
  registerTablesMetadataManagementRouter(router);
  registerSaveLayoutRouter(router);
  registerUpdateTableMetadataRouter(router);
  registerUpdateTableColumnsConfigRouter(router);
  registerUpdateRelationsConfigRoute(router);

  // Ajustes: miembros del CMS
  registerGetMembersRouter(router);
  registerGetMemberDetailsRouter(router);
  registerUpdateMemberRolesRouter(router);
  registerDeactivateMemberRouter(router);
  registerActivateMemberRouter(router);

  // Ajustes: obligación de MFA
  registerMfaConfigurationRouter(router);

  // Ajustes: cuenta y preferencias del usuario del CMS
  registerUpdatePreferencesRouter(router);
  registerGetAccountRoute(router);

  // Auditoría
  registerAuditLogsRoute(router);
  registerAuditLogDetailsRoute(router);
  registerMemberAuditLogsRoute(router);

  // Usuarios de Auth
  registerUsersExplorerRoutes(router);

  // Almacenamiento
  registerStorageBucketsRouter(router);
  registerBucketContentsRouter(router);
  registerFileOperationsRouter(router);
}

/**
 * Comprueba que el `Origin` de la petición es el de la web: el de
 * `VITE_SITE_URL` o, si no está definido, el de la propia URL de la petición.
 */
function isSameOrigin(origin: string, requestUrl: string) {
  const siteUrl =
    import.meta.env?.VITE_SITE_URL ?? process.env['VITE_SITE_URL'];
  const allowed = [new URL(requestUrl).origin];

  if (siteUrl) {
    allowed.push(new URL(siteUrl).origin);
  }

  return allowed.includes(origin);
}
