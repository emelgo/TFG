/**
 * `/blog/$slug`: página pública de una entrada.
 *
 * El *loader* responde 404 (`notFound`) si el slug no tiene el formato de la
 * base de datos o si la entrada no es visible: los borradores, lo archivado
 * y lo programado no existen para la web (lo decide RLS, no esta ruta).
 *
 * El cuerpo se pinta con `SafeMarkdown`: Markdown sin HTML crudo, enlaces
 * externos con `rel="noopener noreferrer nofollow"` e imágenes solo https.
 * Las etiquetas SEO (título, descripción, Open Graph) salen de los campos
 * `seo_*` de la entrada, con el título y el resumen como alternativa.
 *
 * [TFG] RF-01 · RNF-02 · ADR-017.
 */
import { createFileRoute, notFound } from '@tanstack/react-router';

import { SafeMarkdown } from '@pymekit/ui/markdown';
import { sanitizeMarkdownImageSrc } from '@pymekit/ui/markdown-policy';
import { Trans } from '@pymekit/ui/trans';

import { PostHeader } from '#/components/blog/post-header.tsx';
import appConfig from '#/config/app.config.ts';
import { getBlogPostFunction } from '#/lib/blog/blog.functions.ts';
import { BlogSlugSchema } from '#/lib/blog/blog.schema.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/_marketing/blog/$slug')({
  loader: async ({ params }) => {
    // Un slug imposible no llega a la base de datos
    if (!BlogSlugSchema.safeParse(params.slug).success) {
      throw notFound();
    }

    const post = await getBlogPostFunction({ data: { slug: params.slug } });

    if (!post) {
      throw notFound();
    }

    return post;
  },
  head: ({ loaderData, match }) => {
    if (!loaderData) {
      return {
        meta: [
          {
            title: getTranslator(match.context.locale)(
              'marketing.blogPostNotFound',
            ),
          },
        ],
      };
    }

    const title = loaderData.seo_title || loaderData.title;
    const description = loaderData.seo_description || loaderData.excerpt || '';
    const url = `${appConfig.url}/blog/${loaderData.slug}`;
    const image = sanitizeMarkdownImageSrc(loaderData.cover_image_url);

    return {
      meta: [
        { title: `${title} | ${appConfig.name}` },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'article' },
        { property: 'og:url', content: url },
        ...(loaderData.published_at
          ? [
              {
                property: 'article:published_time',
                content: loaderData.published_at,
              },
            ]
          : []),
        ...(image ? [{ property: 'og:image', content: image }] : []),
        {
          name: 'twitter:card',
          content: image ? 'summary_large_image' : 'summary',
        },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
      ],
      links: [{ rel: 'canonical', href: url }],
    };
  },
  component: BlogPostPage,
});

function BlogPostPage() {
  const post = Route.useLoaderData();
  const tags = post.tags.flatMap((link) => (link.tag ? [link.tag] : []));

  return (
    <div
      className="container sm:max-w-none sm:p-0"
      data-testid="blog-post-page"
    >
      <PostHeader post={post} />

      <div className="mx-auto flex max-w-3xl flex-col space-y-6 py-8">
        <article data-testid="blog-post-content">
          <SafeMarkdown siteOrigin={appConfig.url}>{post.content}</SafeMarkdown>
        </article>

        {tags.length > 0 ? (
          <div
            className="flex flex-wrap items-center gap-2 text-sm"
            data-testid="blog-post-tags"
          >
            <span className="text-muted-foreground">
              <Trans i18nKey="marketing.blogTags" />:
            </span>

            {tags.map((tag) => (
              <span
                key={tag.slug}
                className="bg-muted rounded-full px-2.5 py-0.5 text-xs"
                data-testid="blog-post-tag"
              >
                {tag.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
