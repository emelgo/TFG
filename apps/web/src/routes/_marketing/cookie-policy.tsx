import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { LegalPage } from '#/components/marketing/legal-page.tsx';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/_marketing/cookie-policy')({
  head: ({ match }) => ({
    meta: [
      { title: getTranslator(match.context.locale)('marketing.cookiePolicy') },
    ],
  }),
  component: CookiePolicyPage,
});

function CookiePolicyPage() {
  const t = useTranslations('marketing');

  return (
    <LegalPage
      page={'cookies'}
      title={t('cookiePolicy')}
      subtitle={t('cookiePolicyDescription')}
      sections={['what', 'which', 'consent', 'manage']}
    />
  );
}
