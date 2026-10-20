/**
 * Migas de pan de shadcn con los textos accesibles en español.
 *
 * `src/shadcn/breadcrumb.tsx` queda igual que el original; aquí se
 * reexporta y se sustituyen las dos piezas que traen texto en inglés: la
 * etiqueta `aria-label` de la navegación y el texto oculto de los puntos
 * suspensivos. `@pymekit/ui/breadcrumb` apunta a este fichero.
 *
 * [TFG] ADR-021: nada visible (ni accesible) en inglés.
 */
import * as React from 'react';

import { MoreHorizontalIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { cn } from '../lib/utils';
import { Breadcrumb as ShadcnBreadcrumb } from '../shadcn/breadcrumb';

export * from '../shadcn/breadcrumb';

function Breadcrumb(props: React.ComponentProps<typeof ShadcnBreadcrumb>) {
  const t = useTranslations('common.ui');

  return <ShadcnBreadcrumb aria-label={t('breadcrumb')} {...props} />;
}

function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  const t = useTranslations('common.ui');

  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn(
        'flex size-5 items-center justify-center [&>svg]:size-4',
        className,
      )}
      {...props}
    >
      <MoreHorizontalIcon />
      <span className="sr-only">{t('more')}</span>
    </span>
  );
}

export { Breadcrumb, BreadcrumbEllipsis };
