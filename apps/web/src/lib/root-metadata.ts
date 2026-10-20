import appConfig from '#/config/app.config.ts';

/**
 * Construye el `<link rel="canonical">` absoluto de la ruta actual a partir de
 * `appConfig.url`. Evita que los buscadores indexen como páginas duplicadas
 * las variantes de una URL (barra final, parámetros, con o sin www). La web
 * tiene un único idioma, así que no se emiten alternativas `hreflang`.
 */
export function buildCanonicalLink(pathname: string) {
  const path = pathname === '/' ? '' : pathname;

  return { rel: 'canonical', href: `${appConfig.url}${path}` };
}

/**
 * Construye los `meta` y `link` por defecto del `<head>` (título,
 * descripción, Open Graph, Twitter e iconos). Lo devuelve el `head()` de la
 * ruta raíz y cada ruta puede sobrescribirlos.
 */
export function getRootHead() {
  const title = appConfig.title;
  const description = appConfig.description;

  return {
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title },
      { name: 'description', content: description },
      { name: 'application-name', content: appConfig.name },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: appConfig.url },
      { property: 'og:site_name', content: appConfig.name },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      // TODO(futuro): meta csrf-token. Requiere un middleware CSRF que genere
      // la cabecera x-csrf-token, que todavía no existe en la web.
    ],
    links: [
      { rel: 'icon', href: '/images/favicon/favicon.ico' },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/images/favicon/favicon-32x32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/images/favicon/favicon-16x16.png',
      },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/images/favicon/apple-touch-icon.png',
      },
      { rel: 'manifest', href: '/images/favicon/site.webmanifest' },
    ],
  };
}
