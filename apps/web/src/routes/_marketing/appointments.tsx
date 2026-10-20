/**
 * Página pública «Pedir cita» (`/appointments`) del escenario de evaluación
 * «Fisioterapia Bahía».
 *
 * Reutiliza el *layout* de marketing (cabecera, pie, tema e idioma) y la
 * misma composición que la página de contacto; solo cambia el formulario.
 *
 * [TFG] RNF-01 · CU-07.
 */
import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { Heading } from '@pymekit/ui/heading';

import { AppointmentRequestForm } from '#/components/marketing/appointment-request-form.tsx';
import { SitePageHeader } from '#/components/marketing/site-page-header.tsx';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/_marketing/appointments')({
  head: ({ match }) => ({
    meta: [
      {
        title: getTranslator(match.context.locale)(
          'marketing.appointments.title',
        ),
      },
    ],
  }),
  component: AppointmentsPage,
});

function AppointmentsPage() {
  const t = useTranslations('marketing.appointments');

  return (
    <div>
      <SitePageHeader title={t('title')} subtitle={t('subtitle')} />

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
              <Heading level={3}>{t('heading')}</Heading>

              <p className={'text-muted-foreground'}>{t('subheading')}</p>
            </div>

            <AppointmentRequestForm />
          </div>
        </div>
      </div>
    </div>
  );
}
