/**
 * Sección «Paneles» del CMS (`/admin/cms/dashboards`): página provisional hasta F2.8.
 *
 * Cuelga del *layout* `/admin/cms`, que comprueba el acceso al CMS. Está
 * disponible para todo el personal del CMS con acceso válido.
 */
import { createFileRoute } from '@tanstack/react-router';

import { Trans } from '@pymekit/ui/trans';

import { CmsPlaceholderPage } from '#/components/admin/cms/cms-placeholder-page.tsx';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/admin/cms/dashboards/')({
  head: () => ({
    meta: [{ title: getTranslator()('cms.sidebar.dashboards') }],
  }),
  component: () => (
    <CmsPlaceholderPage
      title={<Trans i18nKey="cms.sidebar.dashboards" />}
      increment="F2.8"
    />
  ),
});
