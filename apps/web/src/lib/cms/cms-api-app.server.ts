/**
 * Instancia única (perezosa) de la aplicación Hono de la API del CMS.
 *
 * La comparten los dos caminos por los que la web llega a la API del CMS:
 *
 *  - la ruta de servidor `/api/cms/$` (peticiones HTTP del navegador);
 *  - `cmsFetch` durante el SSR (`./cms-fetch.ts`), que llama a la API dentro
 *    del propio proceso sin pasar por la red.
 *
 * Se importa de forma dinámica y perezosa por dos motivos: el código del CMS
 * (Drizzle, driver de Postgres, clave secreta) solo se carga en el servidor
 * cuando llega la primera petición al CMS, y queda fuera de cualquier *chunk*
 * del navegador. El sufijo `.server.ts` hace que `serverLeakGuard` falle si
 * este módulo llegara alguna vez al cliente.
 */
type CmsApiApp = ReturnType<
  typeof import('@pymekit/cms-api/server').createCmsApiApp
>;

let cmsApiApp: Promise<CmsApiApp> | undefined;

/** Devuelve la aplicación Hono del CMS, creándola la primera vez. */
export function getCmsApiApp() {
  cmsApiApp ??= import('@pymekit/cms-api/server').then((module) =>
    module.createCmsApiApp(),
  );

  return cmsApiApp;
}
