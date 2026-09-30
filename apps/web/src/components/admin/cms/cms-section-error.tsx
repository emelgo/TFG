/**
 * Aviso de error de carga de una sección del CMS con botón de reintento.
 *
 * Lo usan como `errorComponent` las pantallas de usuarios y almacenamiento
 * cuando la API falla por un motivo que no es de acceso (un 403/404 ya se
 * convierte antes en «no encontrado»). No muestra el texto del error.
 */
import { useRouter } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';

import {
  EmptyMedia,
  EmptyState,
  EmptyStateButton,
  EmptyStateHeading,
  EmptyStateText,
} from '@pymekit/ui/empty-state';
import { PageBody } from '@pymekit/ui/page';
import { Trans } from '@pymekit/ui/trans';

export function CmsSectionError(props: { reset: () => void; testId: string }) {
  const router = useRouter();

  return (
    <PageBody className="py-8">
      <EmptyState data-testid={props.testId} className="min-h-64 p-6">
        <EmptyMedia variant="icon">
          <TriangleAlert />
        </EmptyMedia>

        <EmptyStateHeading>
          <Trans i18nKey="cms.access.loadErrorHeading" />
        </EmptyStateHeading>

        <EmptyStateText>
          <Trans i18nKey="cms.access.loadErrorText" />
        </EmptyStateText>

        <EmptyStateButton
          onClick={() => {
            props.reset();
            void router.invalidate();
          }}
        >
          <Trans i18nKey="cms.access.retry" />
        </EmptyStateButton>
      </EmptyState>
    </PageBody>
  );
}
