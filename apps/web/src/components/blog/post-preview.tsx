/**
 * Tarjeta de una entrada en el listado del blog: portada (si tiene), fecha,
 * categoría, título y resumen, enlazando a `/blog/$slug`.
 */
import { Link } from '@tanstack/react-router';

import type { BlogPostSummary } from './blog-types.ts';
import { CoverImage } from './cover-image.tsx';
import { PostDate } from './post-date.tsx';

export function PostPreview({ post }: { post: BlogPostSummary }) {
  return (
    <Link
      to="/blog/$slug"
      params={{ slug: post.slug }}
      data-testid="blog-post-preview"
      data-slug={post.slug}
      className="hover:bg-muted/50 active:bg-muted flex flex-col gap-y-2.5 rounded-md p-4 transition-all"
    >
      {post.cover_image_url ? (
        <div className="relative mb-2 h-[220px] w-full">
          <CoverImage title={post.title} src={post.cover_image_url} />
        </div>
      ) : null}

      <div className="flex flex-col space-y-2">
        <div className="text-muted-foreground flex flex-row items-center gap-x-3 text-xs">
          <PostDate value={post.published_at} />

          {post.category ? <span>{post.category.name}</span> : null}
        </div>

        <h2 className="text-lg leading-snug font-medium tracking-tight">
          <span className="hover:underline">{post.title}</span>
        </h2>

        {post.excerpt ? (
          <p className="text-muted-foreground mb-4 text-sm leading-relaxed">
            {post.excerpt}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
