import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { SitePageHeader } from '#/components/marketing/site-page-header.tsx';
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
    <div>
      <SitePageHeader
        title={t('cookiePolicy')}
        subtitle={t('cookiePolicyDescription')}
      />

      <div className={'container mx-auto py-8'}>
        <div>{t('legalPlaceholder')}</div>
      </div>
    </div>
  );
}
