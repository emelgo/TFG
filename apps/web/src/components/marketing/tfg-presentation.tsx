import { Link } from '@tanstack/react-router';
import { ArrowRightIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import tfgConfig from '#/config/tfg.config.ts';

/**
 * Bloques de la landing que guían la presentación del TFG.
 *
 * - `TfgAcademicBanner`: explica que esta web es una adaptación de la
 *   plantilla PymeKit para una pyme, hecha como TFG en la ESI-UCA.
 * - `TfgDemoTour`: los pasos de la demostración, en el orden en que conviene
 *   enseñarlos, con un enlace directo a cada pantalla.
 *
 * Ambos desaparecen si `tfgConfig.enabled` es falso (ver `tfg.config.ts`).
 */
export function TfgAcademicBanner() {
  const t = useTranslations('marketing.tfg');

  if (!tfgConfig.enabled) {
    return null;
  }

  return (
    <section
      id={'tfg'}
      data-testid={'tfg-banner'}
      className={
        'bg-muted/40 flex flex-col items-center gap-6 rounded-xl border p-6 md:flex-row md:p-8'
      }
    >
      {/* El logotipo es un JPG con fondo blanco: se enmarca en blanco para
          que también se vea bien en el tema oscuro. */}
      <div className={'shrink-0 rounded-lg bg-white p-3'}>
        <img
          src={tfgConfig.logo}
          alt={t('logoAlt')}
          width={220}
          height={91}
          className={'h-auto w-44 md:w-56'}
        />
      </div>

      <div className={'flex flex-col gap-2'}>
        <span
          className={
            'text-muted-foreground text-xs font-semibold tracking-wider uppercase'
          }
        >
          {t('badge')}
        </span>

        <h2 className={'text-xl font-semibold tracking-tight md:text-2xl'}>
          {t('title')}
        </h2>

        <p className={'text-muted-foreground text-sm md:text-base'}>
          {t('description')}
        </p>

        <p className={'text-muted-foreground text-sm'}>
          {t('credits', { author: tfgConfig.author, tutor: tfgConfig.tutor })}
        </p>
      </div>
    </section>
  );
}

/**
 * Pasos del recorrido. Cada uno tiene `<clave>Title` y `<clave>Description` en
 * `marketing.tfg` y el enlace a la pantalla que se enseña.
 */
const TOUR_STEPS = [
  { key: 'stepPublic', href: '/blog' },
  { key: 'stepAuth', href: '/auth/sign-up' },
  { key: 'stepCustomer', href: '/dashboard' },
  { key: 'stepBilling', href: '/pricing' },
  { key: 'stepAdmin', href: '/admin' },
] as const;

export function TfgDemoTour() {
  const t = useTranslations('marketing.tfg');

  if (!tfgConfig.enabled) {
    return null;
  }

  return (
    <section data-testid={'tfg-tour'} className={'flex flex-col gap-6'}>
      <div className={'flex flex-col gap-2 text-center'}>
        <h2 className={'text-2xl font-semibold tracking-tight md:text-3xl'}>
          {t('tourHeading')}
        </h2>

        <p className={'text-muted-foreground'}>{t('tourSubheading')}</p>
      </div>

      <ol className={'grid gap-4 md:grid-cols-2 lg:grid-cols-5'}>
        {TOUR_STEPS.map((step, index) => (
          <li
            key={step.key}
            className={
              'bg-background flex flex-col gap-3 rounded-xl border p-5'
            }
          >
            <span
              className={
                'bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold'
              }
            >
              {index + 1}
            </span>

            <h3 className={'font-medium'}>{t(`${step.key}Title`)}</h3>

            <p className={'text-muted-foreground flex-1 text-sm'}>
              {t(`${step.key}Description`)}
            </p>

            <Link
              to={step.href}
              className={
                'text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline'
              }
            >
              {t('tourOpen')}
              <ArrowRightIcon className={'h-4 w-4'} />
            </Link>
          </li>
        ))}
      </ol>

      <p className={'text-muted-foreground text-center text-xs'}>
        {t('tourNote')}
      </p>
    </section>
  );
}
