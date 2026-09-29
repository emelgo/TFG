import appConfig from '#/config/app.config.ts';

/**
 * @name buildCanonicalLink
 * @description Absolute `<link rel="canonical">` for the current path, sourced
 * from `appConfig.url`. Prevents trailing-slash / query-string / www-vs-apex URL
 * variants from being indexed as separate duplicate documents. Single-locale, so
 * no `hreflang` alternates are emitted (unlike the multi-locale drizzle sibling).
 */
export function buildCanonicalLink(pathname: string) {
  const path = pathname === '/' ? '' : pathname;

  return { rel: 'canonical', href: `${appConfig.url}${path}` };
}

/**
 * @name getRootHead
 * @description Build the default document `<head>` meta + links (title,
 * description, Open Graph, Twitter, icons). Returned from the root route
 * `head()`; individual routes override these per page.
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
      // TODO(migration): csrf-token meta (read x-csrf-token request header via
      // CSP/csrf middleware — CSP not ported)
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
