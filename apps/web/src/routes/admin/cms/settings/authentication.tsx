/**
 * Ajustes > Autenticación (`/admin/cms/settings/authentication`, F2.7a):
 * obligación de MFA para todo el personal del CMS.
 *
 * Solo con permiso `system_setting` (`requireCmsSettingsTab`; sin él,
 * «no encontrado»). El `loader` precarga la configuración
 * (`GET /v1/configuration/mfa`, que trae también lo que el usuario puede
 * hacer con ella) y el componente la lee con `useSuspenseQuery`. Cambiarla
 * exige `system_setting:update` y sesión aal2, y desactivarla, ser cuenta
 * raíz: la API y la base de datos lo comprueban.
 *
 * [TFG] RF-09 · RNF-02 · ADR-014.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { MfaRequirementForm } from '@pymekit/cms-settings-ui/components';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pymekit/ui/card';

import { CmsSectionError } from '#/components/admin/cms/cms-section-error.tsx';
import { requireCmsSettingsTab } from '#/lib/cms/cms-access.ts';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { rethrowCmsSectionError } from '#/lib/cms/cms-section-data.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/admin/cms/settings/authentication')({
  beforeLoad: ({ context }) =>
    requireCmsSettingsTab(context.cmsAccess, 'authentication'),
  loader: async ({ context }) => {
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    try {
      await context.queryClient.ensureQueryData(cmsQueries.mfaConfiguration());
    } catch (error) {
      rethrowCmsSectionError(error);
    }
  },
  head: ({ match }) => ({
    meta: [
      {
        title: getTranslator(match.context.locale)(
          'cms.settings.authentication.title',
        ),
      },
    ],
  }),
  component: AuthenticationSettingsPage,
  errorComponent: ({ reset }) => (
    <CmsSectionError reset={reset} testId="settings-authentication-error" />
  ),
});

function AuthenticationSettingsPage() {
  const t = useTranslations('cms.settings.authentication');
  const { data } = useSuspenseQuery(cmsQueries.mfaConfiguration());

  return (
    <Card className="max-w-2xl" data-testid="cms-settings-authentication">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>

      <CardContent>
        <MfaRequirementForm
          key={String(data.data.requiresMfa)}
          config={data.data}
        />
      </CardContent>
    </Card>
  );
}
