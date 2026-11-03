import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { LegalPage } from '#/components/marketing/legal-page.tsx';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/_marketing/privacy-policy')({
  head: ({ match }) => ({
    meta: [
      { title: getTranslator(match.context.locale)('marketing.privacyPolicy') },
    ],
  }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  const t = useTranslations('marketing');

  return (
    <LegalPage
      page={'privacy'}
      title={t('privacyPolicy')}
      subtitle={t('privacyPolicyDescription')}
      sections={[
        'controller',
        'purposes',
        'legalBasis',
        'recipients',
        'retention',
        'rights',
      ]}
    />
  );
}
