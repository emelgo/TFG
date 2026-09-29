import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { SitePageHeader } from '#/components/marketing/site-page-header.tsx';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/_marketing/privacy-policy')({
  head: () => ({
    meta: [{ title: getTranslator()('marketing.privacyPolicy') }],
  }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  const t = useTranslations('marketing');

  return (
    <div>
      <SitePageHeader
        title={t('privacyPolicy')}
        subtitle={t('privacyPolicyDescription')}
      />

      <div className={'container mx-auto py-8'}>
        <div>Your privacy policy content here</div>
      </div>
    </div>
  );
}
