import { Footer } from '@pymekit/ui/marketing';
import { Trans } from '@pymekit/ui/trans';

import { AppLogo } from '#/components/app-logo.tsx';
import appConfig from '#/config/app.config.ts';

export function SiteFooter() {
  return (
    <Footer
      logo={<AppLogo />}
      description={<Trans i18nKey="marketing.footerDescription" />}
      copyright={
        <Trans
          i18nKey="marketing.copyright"
          values={{
            product: appConfig.name,
            year: new Date().getFullYear(),
          }}
        />
      }
      // [TFG] ADR-021: sin selector de idioma (la web solo está en español).
      sections={[
        {
          heading: <Trans i18nKey="marketing.about" />,
          links: [
            { href: '/contact', label: <Trans i18nKey="marketing.contact" /> },
          ],
        },
        {
          heading: <Trans i18nKey="marketing.product" />,
          links: [
            { href: '/pricing', label: <Trans i18nKey="marketing.pricing" /> },
            { href: '/blog', label: <Trans i18nKey="marketing.blog" /> },
            { href: '/faq', label: <Trans i18nKey="marketing.faq" /> },
          ],
        },
        {
          heading: <Trans i18nKey="marketing.legal" />,
          links: [
            {
              href: '/terms-of-service',
              label: <Trans i18nKey="marketing.termsOfService" />,
            },
            {
              href: '/privacy-policy',
              label: <Trans i18nKey="marketing.privacyPolicy" />,
            },
            {
              href: '/cookie-policy',
              label: <Trans i18nKey="marketing.cookiePolicy" />,
            },
          ],
        },
      ]}
    />
  );
}
