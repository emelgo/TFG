import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { Heading } from '@pymekit/ui/heading';
import { Trans } from '@pymekit/ui/trans';

import { ContactForm } from '#/components/marketing/contact-form.tsx';
import { SitePageHeader } from '#/components/marketing/site-page-header.tsx';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/_marketing/contact')({
  head: ({ match }) => ({
    meta: [{ title: getTranslator(match.context.locale)('marketing.contact') }],
  }),
  component: ContactPage,
});

function ContactPage() {
  const t = useTranslations('marketing');

  return (
    <div>
      <SitePageHeader title={t('contact')} subtitle={t('contactDescription')} />

      <div className={'container mx-auto'}>
        <div
          className={'flex flex-1 flex-col items-center justify-center py-8'}
        >
          <div
            className={
              'flex w-full max-w-lg flex-col space-y-4 rounded-lg border p-8'
            }
          >
            <div>
              <Heading level={3}>
                <Trans i18nKey={'marketing.contactHeading'} />
              </Heading>

              <p className={'text-muted-foreground'}>
                <Trans i18nKey={'marketing.contactSubheading'} />
              </p>
            </div>

            <ContactForm />
          </div>
        </div>
      </div>
    </div>
  );
}
