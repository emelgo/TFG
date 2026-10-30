import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { LegalPage } from '#/components/marketing/legal-page.tsx';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/_marketing/terms-of-service')({
  head: ({ match }) => ({
    meta: [
      {
        title: getTranslator(match.context.locale)('marketing.termsOfService'),
      },
    ],
  }),
  component: TermsOfServicePage,
});

function TermsOfServicePage() {
  const t = useTranslations('marketing');

  return (
    <LegalPage
      page={'terms'}
      title={t('termsOfService')}
      subtitle={t('termsOfServiceDescription')}
      sections={[
        'object',
        'account',
        'subscriptions',
        'use',
        'liability',
        'law',
      ]}
    />
  );
}
