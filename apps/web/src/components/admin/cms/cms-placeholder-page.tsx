/**
 * Página provisional de una sección del CMS que aún no se ha implementado.
 *
 * La base de la interfaz (F2.3) ya registra todas las rutas del CMS bajo el
 * mismo *layout* y la misma guarda de acceso, para que la navegación y los
 * permisos se puedan probar de extremo a extremo. Cada incremento posterior
 * (F2.4–F2.8) sustituye su página provisional por la pantalla real.
 */
import { Construction } from 'lucide-react';

import {
  EmptyMedia,
  EmptyState,
  EmptyStateHeading,
  EmptyStateText,
} from '@pymekit/ui/empty-state';
import { PageBody, PageHeader } from '@pymekit/ui/page';
import { Trans } from '@pymekit/ui/trans';

export function CmsPlaceholderPage(props: {
  /** Título ya resuelto (por ejemplo, `public.accounts`) o clave i18n. */
  title: React.ReactNode;
  /** Incremento del plan que implementará la sección (por ejemplo, `F2.5`). */
  increment: string;
}) {
  return (
    <PageBody>
      <PageHeader title={props.title} />

      <EmptyState data-testid="cms-placeholder" className="min-h-64">
        <EmptyMedia variant="icon">
          <Construction />
        </EmptyMedia>

        <EmptyStateHeading>
          <Trans i18nKey="cms.placeholder.heading" />
        </EmptyStateHeading>

        <EmptyStateText>
          <Trans
            i18nKey="cms.placeholder.text"
            values={{ increment: props.increment }}
          />
        </EmptyStateText>
      </EmptyState>
    </PageBody>
  );
}
