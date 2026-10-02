/**
 * Explorador de almacenamiento del CMS: lista de *buckets*
 * (`/admin/cms/storage`).
 *
 * Exige el permiso de la sección (`requireCmsSection`); la API solo devuelve
 * los *buckets* cuya raíz puede leer el usuario (`cms.has_storage_permission`).
 *
 * [TFG] RF-09 · ADR-011 · ADR-013.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { StorageBucketsView } from '@pymekit/cms-storage-explorer-ui/components';
import { PageBody } from '@pymekit/ui/page';

import { CmsSectionError } from '#/components/admin/cms/cms-section-error.tsx';
import { requireCmsSection } from '#/lib/cms/cms-access.ts';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { rethrowCmsSectionError } from '#/lib/cms/cms-section-data.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/admin/cms/storage/')({
  beforeLoad: ({ context }) => requireCmsSection(context.cmsAccess, 'storage'),
  loader: async ({ context }) => {
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    try {
      await context.queryClient.ensureQueryData(cmsQueries.storageBuckets());
    } catch (error) {
      rethrowCmsSectionError(error);
    }
  },
  head: ({ match }) => ({
    meta: [
      { title: getTranslator(match.context.locale)('cms.sidebar.storage') },
    ],
  }),
  component: StoragePage,
  errorComponent: ({ reset }) => (
    <CmsSectionError reset={reset} testId="storage-load-error" />
  ),
});

function StoragePage() {
  const { data } = useSuspenseQuery(cmsQueries.storageBuckets());

  return (
    <PageBody className="py-2">
      <StorageBucketsView buckets={data.buckets} />
    </PageBody>
  );
}
