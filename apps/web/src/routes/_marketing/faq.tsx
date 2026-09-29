import { createFileRoute } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { Button } from '@pymekit/ui/button';
import { Trans } from '@pymekit/ui/trans';

import { SitePageHeader } from '#/components/marketing/site-page-header.tsx';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/_marketing/faq')({
  head: () => ({ meta: [{ title: getTranslator()('marketing.faq') }] }),
  component: FAQPage,
});

interface FaqItemProps {
  question: string;
  answer: string;
}

// Replace this content with your own questions and answers.
const faqItems: FaqItemProps[] = [
  {
    question: `Do you offer a free trial?`,
    answer: `Yes, we offer a 14-day free trial. You can cancel at any time during the trial period and you won't be charged.`,
  },
  {
    question: `Can I cancel my subscription?`,
    answer: `You can cancel your subscription at any time. You can do this from your account settings.`,
  },
  {
    question: `Where can I find my invoices?`,
    answer: `You can find your invoices in your account settings.`,
  },
  {
    question: `What payment methods do you accept?`,
    answer: `We accept all major credit cards and PayPal.`,
  },
  {
    question: `Can I upgrade or downgrade my plan?`,
    answer: `Yes, you can upgrade or downgrade your plan at any time. You can do this from your account settings.`,
  },
  {
    question: `Do you offer discounts for non-profits?`,
    answer: `Yes, we offer a 50% discount for non-profits. Please contact us to learn more.`,
  },
];

function FAQPage() {
  const t = useTranslations('marketing');

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className={'flex flex-col space-y-4 xl:space-y-8'}>
        <SitePageHeader title={t('faq')} subtitle={t('faqSubtitle')} />

        <div className={'container flex flex-col items-center space-y-8 pb-16'}>
          <div className="divide-border flex w-full max-w-xl flex-col divide-y divide-dashed rounded-md border">
            {faqItems.map((item, index) => (
              <FaqItem key={index} item={item} />
            ))}
          </div>

          <div>
            <Button
              nativeButton={false}
              render={<Link to={'/contact'} />}
              variant={'link'}
            >
              <span>
                <Trans i18nKey={'marketing.contactFaq'} />
              </span>

              <ArrowRight className={'ml-2 w-4'} />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function FaqItem({ item }: { item: FaqItemProps }) {
  return (
    <details
      className={
        'hover:bg-muted/70 [&:open]:bg-muted/70 [&:open]:hover:bg-muted transition-all'
      }
    >
      <summary
        className={'flex items-center justify-between p-4 hover:cursor-pointer'}
      >
        <h2 className={'cursor-pointer font-sans text-base'}>
          {item.question}
        </h2>

        <div>
          <ChevronDown
            className={'h-5 transition duration-300 group-open:-rotate-180'}
          />
        </div>
      </summary>

      <div className={'text-muted-foreground flex flex-col gap-y-2 px-4 pb-2'}>
        {item.answer}
      </div>
    </details>
  );
}
