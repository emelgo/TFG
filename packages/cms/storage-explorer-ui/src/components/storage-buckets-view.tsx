/**
 * Lista de *buckets* del almacenamiento (`/admin/cms/storage`).
 *
 * Solo aparecen los *buckets* cuya raíz puede leer el usuario: la API los
 * filtra con `cms.has_storage_permission`. Sin ninguno (por ejemplo, el
 * personal de soporte del *seed*), se muestra un estado vacío.
 */
import { Link } from '@tanstack/react-router';
import { FolderIcon, GlobeIcon, LockIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { CmsStorageBucket } from '@pymekit/cms-ui-core/api';
import { useIsHydrated } from '@pymekit/cms-ui-core/hydration';
import { CMS_SECTION_PATHS } from '@pymekit/cms-ui-core/sections';
import { Badge } from '@pymekit/ui/badge';
import {
  EmptyMedia,
  EmptyState,
  EmptyStateHeading,
  EmptyStateText,
} from '@pymekit/ui/empty-state';

export function StorageBucketsView(props: { buckets: CmsStorageBucket[] }) {
  const t = useTranslations('cms.storageExplorer');
  const hydrated = useIsHydrated();

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="storage-explorer"
      data-hydrated={hydrated}
    >
      <h1 className="flex items-center gap-2 text-sm font-medium">
        <FolderIcon className="text-muted-foreground h-4 w-4" />
        {t('title')}
      </h1>

      {props.buckets.length === 0 ? (
        <EmptyState data-testid="storage-no-buckets" className="min-h-64 p-6">
          <EmptyMedia variant="icon">
            <FolderIcon />
          </EmptyMedia>
          <EmptyStateHeading>{t('buckets.emptyHeading')}</EmptyStateHeading>
          <EmptyStateText>{t('buckets.emptyText')}</EmptyStateText>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {props.buckets.map((bucket) => (
            <Link
              key={bucket.id}
              to={getBucketHref(bucket.name)}
              data-testid={`storage-bucket-${bucket.name}`}
              className="hover:bg-muted/50 flex items-center justify-between gap-3 rounded-md border p-4 transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <FolderIcon className="text-muted-foreground h-4 w-4" />
                {bucket.name}
              </span>

              <Badge variant="outline">
                {bucket.public ? (
                  <GlobeIcon className="h-3 w-3" />
                ) : (
                  <LockIcon className="h-3 w-3" />
                )}
                {bucket.public ? t('buckets.public') : t('buckets.private')}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ruta de la consola de un *bucket*. */
function getBucketHref(bucket: string): string {
  return `${CMS_SECTION_PATHS.storage}/${encodeURIComponent(bucket)}`;
}
