import { Link, createFileRoute } from '@tanstack/react-router';
import { ArrowRightIcon, LayoutDashboard } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { PricingTable } from '@pymekit/billing-gateway/marketing';
import {
  CtaButton,
  EcosystemShowcase,
  FeatureCard,
  FeatureGrid,
  FeatureShowcase,
  FeatureShowcaseIconContainer,
  Hero,
  Pill,
  PillActionButton,
  SecondaryHero,
} from '@pymekit/ui/marketing';
import { Trans } from '@pymekit/ui/trans';

import billingConfig from '#/config/billing.config.ts';
import pathsConfig from '#/config/paths.config.ts';

export const Route = createFileRoute('/_marketing/')({
  component: Home,
});

/**
 * Página de inicio pública (landing) de PymeKit.
 *
 * Todo el texto sale del catálogo `marketing.home.*` para que la landing se
 * muestre en el idioma activo (hoy solo español, ADR-021). El contenido describe solo lo que PymeKit hace de verdad: no hay
 * clientes, testimonios ni cifras inventadas.
 */
function Home() {
  const t = useTranslations('marketing.home');

  return (
    <div className={'mt-4 flex flex-col space-y-24 py-14'}>
      <div className={'container mx-auto'}>
        <Hero
          pill={
            <Pill label={t('pillLabel')}>
              <span>{t('pillText')}</span>
              <PillActionButton
                render={
                  <Link to={'/auth/sign-up'}>
                    <ArrowRightIcon className={'h-4 w-4'} />
                  </Link>
                }
              />
            </Pill>
          }
          title={
            <span className="text-secondary-foreground">
              <span>{t('heroTitle')}</span>
            </span>
          }
          subtitle={<span>{t('heroSubtitle')}</span>}
          cta={<MainCallToActionButton />}
          image={
            <img
              className={
                'dark:border-primary/10 w-full rounded-lg border border-gray-200'
              }
              width={3558}
              height={2222}
              src={`/images/dashboard.png`}
              alt={t('heroImageAlt')}
            />
          }
        />
      </div>

      <div className={'container mx-auto'}>
        <div className={'py-4 xl:py-8'}>
          <FeatureShowcase
            heading={
              <>
                <b className="font-medium tracking-tight dark:text-white">
                  {t('featuresHeading')}
                </b>
                .{' '}
                <span className="text-secondary-foreground/70 block font-normal tracking-tight">
                  {t('featuresSubheading')}
                </span>
              </>
            }
            icon={
              <FeatureShowcaseIconContainer>
                <LayoutDashboard className="h-4 w-4" />
                <span>{t('featuresBadge')}</span>
              </FeatureShowcaseIconContainer>
            }
          >
            <FeatureGrid>
              {FEATURES.map((feature) => (
                <FeatureCard
                  key={feature}
                  className={'relative col-span-1 overflow-hidden'}
                  label={t(`${feature}Title`)}
                  description={t(`${feature}Description`)}
                />
              ))}
            </FeatureGrid>
          </FeatureShowcase>
        </div>
      </div>

      <div className={'container mx-auto'}>
        <EcosystemShowcase
          heading={t('showcaseHeading')}
          description={t('showcaseDescription')}
        >
          <img
            className="rounded-md"
            src={'/images/sign-in.png'}
            alt={t('showcaseImageAlt')}
            width={1000}
            height={1000}
          />
        </EcosystemShowcase>
      </div>

      <div className={'container mx-auto'}>
        <div
          className={
            'flex flex-col items-center justify-center space-y-12 py-4 xl:py-8'
          }
        >
          <SecondaryHero
            pill={<Pill label={t('pricingPill')}>{t('pricingPillText')}</Pill>}
            heading={t('pricingHeading')}
            subheading={t('pricingSubheading')}
          />

          <div className={'w-full'}>
            <PricingTable
              config={billingConfig}
              paths={{
                signUp: pathsConfig.auth.signUp,
                return: pathsConfig.app.home,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Prefijos de las tarjetas de funcionalidades: cada uno tiene su pareja de
 * claves `<prefijo>Title` y `<prefijo>Description` en `marketing.home`.
 */
const FEATURES = [
  'featureAuth',
  'featureTeams',
  'featureBilling',
  'featureCms',
  'featureBlog',
  'featureSecurity',
] as const;

function MainCallToActionButton() {
  return (
    <div className={'flex space-x-2.5'}>
      <CtaButton className="h-10 text-sm">
        <Link to={'/auth/sign-up'}>
          <span className={'flex items-center space-x-0.5'}>
            <span>
              <Trans i18nKey={'common.getStarted'} />
            </span>

            <ArrowRightIcon
              className={
                'animate-in fade-in slide-in-from-left-8 h-4' +
                ' zoom-in fill-mode-both delay-1000 duration-1000'
              }
            />
          </span>
        </Link>
      </CtaButton>

      <CtaButton variant={'link'} className="h-10 text-sm">
        <Link to={'/pricing'}>
          <Trans i18nKey={'common.pricing'} />
        </Link>
      </CtaButton>
    </div>
  );
}
