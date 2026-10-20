/**
 * Paginación de shadcn con los textos en español.
 *
 * `src/shadcn/pagination.tsx` queda igual que el original, que trae en
 * inglés «Previous», «Next» y sus etiquetas accesibles. Aquí se reexporta
 * y se pasan esos textos desde i18n (`common.ui.*`); los puntos suspensivos
 * se reescriben porque su texto oculto no se puede cambiar desde fuera.
 * `@pymekit/ui/pagination` apunta a este fichero.
 *
 * [TFG] ADR-021: nada visible (ni accesible) en inglés.
 */
import * as React from 'react';

import { MoreHorizontalIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { cn } from '../lib/utils';
import {
  Pagination as ShadcnPagination,
  PaginationNext as ShadcnPaginationNext,
  PaginationPrevious as ShadcnPaginationPrevious,
} from '../shadcn/pagination';

export * from '../shadcn/pagination';

function Pagination(props: React.ComponentProps<typeof ShadcnPagination>) {
  const t = useTranslations('common.ui');

  return <ShadcnPagination aria-label={t('pagination')} {...props} />;
}

function PaginationPrevious(
  props: React.ComponentProps<typeof ShadcnPaginationPrevious>,
) {
  const t = useTranslations('common.ui');

  return (
    <ShadcnPaginationPrevious
      aria-label={t('goToPreviousPage')}
      text={t('previous')}
      {...props}
    />
  );
}

function PaginationNext(
  props: React.ComponentProps<typeof ShadcnPaginationNext>,
) {
  const t = useTranslations('common.ui');

  return (
    <ShadcnPaginationNext
      aria-label={t('goToNextPage')}
      text={t('next')}
      {...props}
    />
  );
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  const t = useTranslations('common.ui');

  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-8 items-center justify-center [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <MoreHorizontalIcon />
      <span className="sr-only">{t('morePages')}</span>
    </span>
  );
}

export { Pagination, PaginationEllipsis, PaginationNext, PaginationPrevious };
