/**
 * Paginación del listado del blog. Usa enlaces (no botones con `navigate`)
 * para que los buscadores también puedan recorrer las páginas; conserva el
 * filtro de categoría.
 */
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';

import { Button } from '@pymekit/ui/button';
import { Trans } from '@pymekit/ui/trans';

export function BlogPagination(props: {
  page: number;
  pageCount: number;
  category: string | null;
}) {
  const category = props.category ?? undefined;

  return (
    <nav className="flex items-center gap-x-2" data-testid="blog-pagination">
      {props.page > 1 ? (
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link
              to="/blog"
              search={{
                page: props.page > 2 ? props.page - 1 : undefined,
                category,
              }}
              data-testid="blog-pagination-previous"
            />
          }
        >
          <ArrowLeft className="mr-2 h-4" />
          <Trans i18nKey="marketing.blogPaginationPrevious" />
        </Button>
      ) : null}

      <span className="text-muted-foreground text-sm">
        <Trans
          i18nKey="marketing.blogPageIndicator"
          values={{ page: props.page, pageCount: props.pageCount }}
        />
      </span>

      {props.page < props.pageCount ? (
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link
              to="/blog"
              search={{ page: props.page + 1, category }}
              data-testid="blog-pagination-next"
            />
          }
        >
          <Trans i18nKey="marketing.blogPaginationNext" />
          <ArrowRight className="ml-2 h-4" />
        </Button>
      ) : null}
    </nav>
  );
}
