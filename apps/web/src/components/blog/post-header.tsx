/**
 * Cabecera de la página de una entrada: fecha, categoría, título, resumen y
 * portada.
 */
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

import { Trans } from '@pymekit/ui/trans';

import type { BlogPostDetail } from './blog-types.ts';
import { CoverImage } from './cover-image.tsx';
import { PostDate } from './post-date.tsx';

export function PostHeader({ post }: { post: BlogPostDetail }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-border/50 border-b py-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-y-2.5">
          <Link
            to="/blog"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            data-testid="blog-back-link"
          >
            <ArrowLeft className="h-3" />
            <Trans i18nKey="marketing.backToBlog" />
          </Link>

          <div className="text-muted-foreground flex items-center gap-x-3 text-xs">
            <PostDate value={post.published_at} />

            {post.category ? (
              <Link
                to="/blog"
                search={{ category: post.category.slug }}
                className="hover:underline"
              >
                {post.category.name}
              </Link>
            ) : null}
          </div>

          <h1
            className="font-heading text-2xl font-medium tracking-tighter xl:text-4xl dark:text-white"
            data-testid="blog-post-title"
          >
            {post.title}
          </h1>

          {post.excerpt ? (
            <p className="text-muted-foreground text-base">{post.excerpt}</p>
          ) : null}
        </div>
      </div>

      {post.cover_image_url ? (
        <div className="relative mx-auto mt-8 flex h-[378px] w-full max-w-3xl justify-center">
          <CoverImage
            className="rounded-md"
            title={post.title}
            src={post.cover_image_url}
          />
        </div>
      ) : null}
    </div>
  );
}
