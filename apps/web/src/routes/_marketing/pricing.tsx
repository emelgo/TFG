import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { PricingTable } from '@pymekit/billing-gateway/marketing';

import { SitePageHeader } from '#/components/marketing/site-page-header.tsx';
import billingConfig from '#/config/billing.config.ts';
import pathsConfig from '#/config/paths.config.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

const paths = {
  signUp: pathsConfig.auth.signUp,
  return: pathsConfig.app.home,
};

export const Route = createFileRoute('/_marketing/pricing')({
  head: ({ match }) => ({
    meta: [{ title: getTranslator(match.context.locale)('marketing.pricing') }],
  }),
  component: PricingPage,
});

function PricingPage() {
  const t = useTranslations('marketing');

  return (
    <div className={'flex flex-col space-y-8'}>
      <SitePageHeader title={t('pricing')} subtitle={t('pricingSubtitle')} />

      <div className={'container mx-auto pb-8 xl:pb-16'}>
        <PricingTable paths={paths} config={billingConfig} />
      </div>
    </div>
  );
}
