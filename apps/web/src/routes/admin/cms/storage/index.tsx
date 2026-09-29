/**
 * Sección «Almacenamiento» del CMS (`/admin/cms/storage`): página provisional hasta F2.5.
 *
 * Cuelga del *layout* `/admin/cms`, que comprueba el acceso al CMS. Tiene
 * permiso propio en el RBAC del CMS, así que además exige ese permiso
 * (`requireCmsSection`).
 */
import { createFileRoute } from '@tanstack/react-router';

import { Trans } from '@pymekit/ui/trans';

import { CmsPlaceholderPage } from '#/components/admin/cms/cms-placeholder-page.tsx';
import { requireCmsSection } from '#/lib/cms/cms-access.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/admin/cms/storage/')({
  // Sección con permiso propio: si la barra lateral la oculta, escribir la
  // URL a mano tampoco la muestra.
  beforeLoad: ({ context }) => requireCmsSection(context.cmsAccess, 'storage'),
  head: () => ({ meta: [{ title: getTranslator()('cms.sidebar.storage') }] }),
  component: () => (
    <CmsPlaceholderPage
      title={<Trans i18nKey="cms.sidebar.storage" />}
      increment="F2.5"
    />
  ),
});
