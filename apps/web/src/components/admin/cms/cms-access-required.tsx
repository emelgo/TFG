/**
 * Aviso de acceso pendiente al CMS.
 *
 * Se muestra en lugar de las pantallas del CMS cuando la API responde 403 con
 * `CMS_MFA_OR_INACTIVE_ACCOUNT`: el usuario es personal del CMS, pero su
 * sesión no ha verificado el segundo factor (el MFA es obligatorio por
 * defecto, ADR-014) o su cuenta del CMS está desactivada. Ofrece el enlace a
 * la verificación en dos pasos, que devuelve al usuario a esta misma página
 * (`next`), y otro a los ajustes del perfil por si aún no ha configurado el
 * segundo factor.
 *
 * Se usan enlaces normales (`<a>`) y no `Link` a propósito: tras verificar el
 * segundo factor hace falta una carga completa para que el `beforeLoad` raíz
 * vuelva a leer la sesión, ya con aal2.
 */
import { ShieldAlert } from 'lucide-react';

import { Button } from '@pymekit/ui/button';
import {
  EmptyMedia,
  EmptyState,
  EmptyStateHeading,
  EmptyStateText,
} from '@pymekit/ui/empty-state';
import { PageBody } from '@pymekit/ui/page';
import { Trans } from '@pymekit/ui/trans';

import pathsConfig from '#/config/paths.config.ts';

export function CmsAccessRequired(props: { next: string }) {
  return (
    <PageBody className="py-8">
      <EmptyState data-testid="cms-mfa-required" className="min-h-80 p-6">
        <EmptyMedia variant="icon">
          <ShieldAlert />
        </EmptyMedia>

        <EmptyStateHeading>
          <Trans i18nKey="cms.access.mfaRequiredHeading" />
        </EmptyStateHeading>

        <EmptyStateText className="max-w-xl">
          <Trans i18nKey="cms.access.mfaRequiredText" />
        </EmptyStateText>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button
            nativeButton={false}
            data-testid="cms-verify-mfa-link"
            render={
              <a
                href={`${pathsConfig.auth.verifyMfa}?next=${encodeURIComponent(props.next)}`}
              />
            }
          >
            <Trans i18nKey="cms.access.verifyMfa" />
          </Button>

          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={pathsConfig.app.settingsProfile} />}
          >
            <Trans i18nKey="cms.access.setupMfa" />
          </Button>
        </div>
      </EmptyState>
    </PageBody>
  );
}
