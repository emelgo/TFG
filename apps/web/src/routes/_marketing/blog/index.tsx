/**
 * `/blog`: listado público de las entradas publicadas.
 *
 * Los parámetros de la URL (`page`, `category`) se normalizan con
 * `parseBlogSearch` (un valor no válido se ignora en lugar de romper la
 * página) y son las dependencias del *loader*, que llama a la *server
 * function* del blog. Las entradas las filtra la base de datos (RLS): aquí
 * solo llega lo publicado.
 *
 * [TFG] RF-01 · ADR-017: el contenido gestionado desde el CMS se publica en
 * la web.
 */
import { createFileRoute, notFound } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { Trans } from '@pymekit/ui/trans';

import { BlogCategoryFilter } from '#/components/blog/blog-category-filter.tsx';
import { BlogPagination } from '#/components/blog/blog-pagination.tsx';
import { PostPreview } from '#/components/blog/post-preview.tsx';
import { SitePageHeader } from '#/components/marketing/site-page-header.tsx';
import appConfig from '#/config/app.config.ts';
import { getBlogPostsFunction } from '#/lib/blog/blog.functions.ts';
import { getBlogPageCount, parseBlogSearch } from '#/lib/blog/blog.schema.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/_marketing/blog/')({
  validateSearch: parseBlogSearch,
  loaderDeps: ({ search }) => ({
    page: search.page ?? 1,
    category: search.category,
  }),
  loader: async ({ deps }) => {
    const data = await getBlogPostsFunction({
      data: { page: deps.page, category: deps.category },
    });

    // Una página más allá de la última no existe: 404 en lugar de un
    // «no hay entradas» indexable (y engañoso) con estado 200.
    if (deps.page > 1 && data.items.length === 0) {
      throw notFound();
    }

    return data;
  },
  head: ({ loaderData }) => {
    const t = getTranslator();
    const title = `${t('marketing.blog')} | ${appConfig.name}`;
    const description = t('marketing.blogSubtitle');

    const meta = [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: `${appConfig.url}/blog` },
    ];

    if (!loaderData) {
      return { meta };
    }

    // `rel=prev/next` indica a los buscadores la relación entre las páginas
    // del listado (en lugar de tratarlas como contenido duplicado).
    const { page, total, pageSize, category } = loaderData;
    const pageCount = getBlogPageCount(total, pageSize);
    const buildHref = (target: number) => {
      const params = new URLSearchParams();

      if (target > 1) {
        params.set('page', String(target));
      }

      if (category) {
        params.set('category', category);
      }

      const query = params.toString();

      return query ? `/blog?${query}` : '/blog';
    };

    const links: Array<{ rel: string; href: string }> = [];

    if (page > 1) {
      links.push({ rel: 'prev', href: buildHref(page - 1) });
    }

    if (page < pageCount) {
      links.push({ rel: 'next', href: buildHref(page + 1) });
    }

    return { meta, links };
  },
  component: BlogPage,
});

function BlogPage() {
  const t = useTranslations('marketing');
  const data = Route.useLoaderData();
  const pageCount = getBlogPageCount(data.total, data.pageSize);

  return (
    <>
      <SitePageHeader title={t('blog')} subtitle={t('blogSubtitle')} />

      <div
        className="container flex flex-col space-y-6 py-8"
        data-testid="blog-page"
      >
        <BlogCategoryFilter
          categories={data.categories}
          active={data.category}
        />

        {!data.categoryFound ? (
          <p
            className="text-muted-foreground"
            data-testid="blog-category-not-found"
          >
            <Trans i18nKey="marketing.blogCategoryNotFound" />
          </p>
        ) : data.items.length === 0 ? (
          <p className="text-muted-foreground" data-testid="blog-empty">
            <Trans i18nKey="marketing.noPosts" />
          </p>
        ) : (
          <>
            <div
              className="grid grid-cols-1 gap-y-8 md:grid-cols-2 md:gap-x-2 md:gap-y-12 lg:grid-cols-3"
              data-testid="blog-post-list"
            >
              {data.items.map((post) => (
                <PostPreview key={post.id} post={post} />
              ))}
            </div>

            <BlogPagination
              page={data.page}
              pageCount={pageCount}
              category={data.category}
            />
          </>
        )}
      </div>
    </>
  );
}
