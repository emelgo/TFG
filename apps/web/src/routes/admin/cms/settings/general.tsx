/**
 * Ajustes > General (`/admin/cms/settings/general`, F2.7a): preferencias
 * personales del usuario del CMS (idioma y zona horaria).
 *
 * No necesita *loader*: la cuenta del CMS (con sus preferencias) ya está en
 * la caché, porque la cargó el `beforeLoad` del *layout* `/admin/cms`. Al
 * guardar, la mutación invalida esa misma entrada; el *layout* la vuelve a
 * leer y su `FormatterPreferencesProvider` aplica la zona horaria nueva a
 * todas las fechas del CMS. El formulario se monta con una `key` que depende
 * de lo guardado para empezar de cero tras cada cambio.
 *
 * El idioma de la web vive en una *cookie*: si el usuario elige otro, se
 * aplica con `useChangeLocale` (que recarga la página).
 *
 * [TFG] RF-09 · ADR-013.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useLocale, useTranslations } from 'use-intl';

import { GeneralSettingsForm } from '@pymekit/cms-settings-ui/components';
import { getCmsPreferences } from '@pymekit/cms-ui-core/preferences';
import { locales } from '@pymekit/i18n/config';
import { useChangeLocale } from '@pymekit/i18n/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pymekit/ui/card';

import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/admin/cms/settings/general')({
  head: () => ({
    meta: [{ title: getTranslator()('cms.settings.general.title') }],
  }),
  component: GeneralSettingsPage,
});

function GeneralSettingsPage() {
  const t = useTranslations('cms.settings.general');
  const currentLocale = useLocale();
  const changeLocale = useChangeLocale();
  const { data } = useSuspenseQuery(cmsQueries.account());
  const preferences = getCmsPreferences(data.account.preferences);

  return (
    <Card className="max-w-2xl" data-testid="cms-settings-general">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>

      <CardContent>
        <GeneralSettingsForm
          key={`${preferences.language ?? ''}|${preferences.timezone ?? ''}`}
          preferences={preferences}
          locales={locales}
          currentLocale={currentLocale}
          onLanguageChange={changeLocale}
        />
      </CardContent>
    </Card>
  );
}
