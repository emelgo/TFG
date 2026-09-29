import { createFileRoute } from '@tanstack/react-router';

import appConfig from '#/config/app.config.ts';

// Static, publicly-indexable marketing paths.
const STATIC_PATHS = [
  '/',
  '/faq',
  '/pricing',
  '/contact',
  '/terms-of-service',
  '/privacy-policy',
  '/cookie-policy',
];

function buildSitemap() {
  const siteUrl = appConfig.url;
  const urls = STATIC_PATHS.map(
    (path) => `  <url><loc>${siteUrl}${path === '/' ? '' : path}</loc></url>`,
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () => {
        const body = buildSitemap();

        return new Response(body, {
          headers: {
            'content-type': 'application/xml',
            'cache-control': 'public, max-age=60, s-maxage=3600',
          },
        });
      },
    },
  },
});
