/**
 * Filtro por categoría del listado del blog: una píldora por categoría más
 * «Todas». La categoría activa va en la URL (`/blog?category=<slug>`), así
 * que el filtro se puede compartir y los buscadores lo ven como un enlace.
 */
import { Link } from '@tanstack/react-router';

import { Trans } from '@pymekit/ui/trans';
import { cn } from '@pymekit/ui/utils';

const pillClassName =
  'rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted';

export function BlogCategoryFilter(props: {
  categories: Array<{ name: string; slug: string }>;
  active: string | null;
}) {
  if (props.categories.length === 0) {
    return null;
  }

  return (
    <nav
      className="flex flex-wrap items-center gap-2"
      data-testid="blog-category-filter"
    >
      <span className="sr-only">
        <Trans i18nKey="marketing.blogCategoryFilter" />
      </span>

      <Link
        to="/blog"
        className={cn(pillClassName, !props.active && 'bg-muted font-medium')}
        data-testid="blog-category-all"
      >
        <Trans i18nKey="marketing.blogAllCategories" />
      </Link>

      {props.categories.map((category) => (
        <Link
          key={category.slug}
          to="/blog"
          search={{ category: category.slug }}
          className={cn(
            pillClassName,
            props.active === category.slug && 'bg-muted font-medium',
          )}
          data-testid={`blog-category-${category.slug}`}
        >
          {category.name}
        </Link>
      ))}
    </nav>
  );
}
