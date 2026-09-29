/**
 * Punto de montaje de la API del CMS en la web.
 *
 * Esta ruta de servidor de TanStack Start captura todo lo que cuelga de
 * `/api/cms/*` (el segmento `$` es un comodín) y reenvía la petición, tal cual,
 * a la aplicación Hono del CMS (`@pymekit/cms-api/server`). Hono resuelve la
 * ruta concreta (`/api/cms/v1/...`), aplica su autenticación y devuelve una
 * `Response` estándar, que TanStack Start envía al navegador.
 *
 * Así el CMS no necesita un servidor propio: comparte proceso, dominio y
 * *cookies* de sesión con la web, y un super-admin que ya ha iniciado sesión
 * en la consola de administración puede usarlo sin volver a identificarse.
 *
 * Las cabeceras de seguridad globales de `src/start.ts` también se aplican a
 * estas respuestas. La protección CSRF global solo cubre las *server
 * functions*, por eso la API del CMS mantiene la suya (ver
 * `packages/cms/api/src/server.ts`).
 *
 * [TFG] RF-09 · ADR-011: el CMS se integra en la web como una API Hono montada
 * en una ruta de servidor, sin un servicio aparte.
 */
import { createFileRoute } from '@tanstack/react-router';

type CmsApiApp = ReturnType<
  typeof import('@pymekit/cms-api/server').createCmsApiApp
>;

let cmsApiApp: Promise<CmsApiApp> | undefined;

/**
 * Devuelve la aplicación Hono del CMS, creándola la primera vez.
 *
 * Se importa de forma dinámica y perezosa por dos motivos: el código del CMS
 * (Drizzle, driver de Postgres, clave secreta) solo se carga en el servidor
 * cuando llega la primera petición al CMS, y queda fuera de cualquier *chunk*
 * del navegador aunque este fichero forme parte del árbol de rutas.
 */
function getCmsApiApp() {
  cmsApiApp ??= import('@pymekit/cms-api/server').then((module) =>
    module.createCmsApiApp(),
  );

  return cmsApiApp;
}

/** Reenvía la petición a la aplicación Hono del CMS. */
async function handleCmsApiRequest({ request }: { request: Request }) {
  const app = await getCmsApiApp();

  return app.fetch(request);
}

export const Route = createFileRoute('/api/cms/$')({
  server: {
    handlers: {
      GET: handleCmsApiRequest,
      POST: handleCmsApiRequest,
      PUT: handleCmsApiRequest,
      PATCH: handleCmsApiRequest,
      DELETE: handleCmsApiRequest,
      OPTIONS: handleCmsApiRequest,
    },
  },
});
