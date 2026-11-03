/**
 * Página legal de la web pública (privacidad, términos y cookies).
 *
 * Las tres páginas comparten estructura: un aviso de que el texto es una
 * plantilla y una serie de apartados con título y cuerpo, cuyos textos están
 * en el catálogo de mensajes (`marketing.legal.<página>.<apartado>`). Así una
 * pyme que reutiliza PymeKit solo tiene que completar los datos entre
 * corchetes en los mensajes, sin tocar el código. Los apartados siguen la
 * información que exigen el RGPD (art. 13) y la LSSI-CE, pero el texto no
 * sustituye a la revisión de un asesor legal.
 *
 * [TFG] RF-01, RNF-01.
 */
import { useTranslations } from 'use-intl';

import appConfig from '#/config/app.config.ts';

import { SitePageHeader } from './site-page-header.tsx';

export function LegalPage(props: {
  page: 'privacy' | 'terms' | 'cookies';
  title: string;
  subtitle: string;
  sections: readonly string[];
}) {
  const t = useTranslations(`marketing.legal`);
  const values = { productName: appConfig.name };

  return (
    <div>
      <SitePageHeader title={props.title} subtitle={props.subtitle} />

      <div className={'container mx-auto max-w-3xl space-y-8 py-8'}>
        <p
          className={'text-muted-foreground rounded-lg border p-4 text-sm'}
          data-testid={'legal-template-notice'}
        >
          {t('templateNotice', values)}
        </p>

        {props.sections.map((section) => (
          <section key={section} className={'space-y-2'}>
            <h2 className={'text-xl font-semibold'}>
              {t(`${props.page}.${section}.title`, values)}
            </h2>
            <p className={'text-muted-foreground leading-relaxed'}>
              {t(`${props.page}.${section}.body`, values)}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
