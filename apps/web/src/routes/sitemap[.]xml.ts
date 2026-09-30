/**
 * `/sitemap.xml`: mapa del sitio para los buscadores.
 *
 * Incluye las páginas públicas fijas y, desde F2.6b, el blog y cada entrada
 * publicada (con su fecha de última modificación). Las entradas se leen con
 * el cliente con RLS, igual que la web: el visitante del *sitemap* es
 * anónimo, así que solo aparece lo publicado. Si la base de datos falla, se
 * sirve igualmente el mapa con las páginas fijas.
 *
 * [TFG] RF-01 · ADR-017.
 */
import { createFileRoute } from '@tanstack/react-router';

import { getLogger } from '@pymekit/shared/logger';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

import appConfig from '#/config/app.config.ts';
import { createBlogService } from '#/lib/blog/blog.service.server.ts';

// Páginas públicas fijas e indexables.
const STATIC_PATHS = [
  '/',
  '/faq',
  '/pricing',
  '/blog',
  '/contact',
  '/terms-of-service',
  '/privacy-policy',
  '/cookie-policy',
];

type SitemapEntry = { path: string; lastModified?: string };

// Los slugs ya cumplen `^[a-z0-9-]+$` (CHECK de la base de datos), pero se
// escapa igualmente: el XML no debe depender de una validación ajena.
function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSitemap(entries: SitemapEntry[]) {
  const siteUrl = appConfig.url;

  const urls = entries
    .map(({ path, lastModified }) => {
      const loc = escapeXml(`${siteUrl}${path === '/' ? '' : path}`);
      const lastmod = lastModified
        ? `<lastmod>${escapeXml(lastModified)}</lastmod>`
        : '';

      return `  <url><loc>${loc}</loc>${lastmod}</url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

async function getBlogEntries(): Promise<SitemapEntry[]> {
  try {
    const posts = await createBlogService(
      getSupabaseServerClient(),
    ).listSitemapEntries();

    return posts.map((post) => ({
      path: `/blog/${post.slug}`,
      lastModified: post.updated_at ?? post.published_at ?? undefined,
    }));
  } catch (error) {
    const logger = await getLogger();

    logger.error({ error, name: 'sitemap' }, 'Failed to load blog posts');

    return [];
  }
}

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const blogEntries = await getBlogEntries();

        const body = buildSitemap([
          ...STATIC_PATHS.map((path) => ({ path })),
          ...blogEntries,
        ]);

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
