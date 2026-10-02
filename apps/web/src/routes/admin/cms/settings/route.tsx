/**
 * *Layout* de Ajustes del CMS (`/admin/cms/settings/**`, F2.7a).
 *
 * Pinta la navegación entre pestañas (General, Autenticación y Miembros)
 * con solo las que el usuario puede ver, según el `access` que devolvió
 * `GET /v1/account` al cargar el *layout* del CMS
 * (`getCmsSettingsTabVisibility`): el personal de soporte, por ejemplo,
 * solo ve «General». Cada pestaña con permiso propio vuelve a comprobarlo en
 * su `beforeLoad` (`requireCmsSettingsTab`) y la API responde 403 sin él.
 *
 * [TFG] RF-09 · ADR-014 · ADR-016: interfaz filtrada por el RBAC del CMS
 * (resuelve el pendiente de F2.3 «filtrado por pestaña en Ajustes»).
 */
import { Outlet, createFileRoute } from '@tanstack/react-router';

import { SettingsNav } from '@pymekit/cms-settings-ui/components';
import { getCmsSettingsTabVisibility } from '@pymekit/cms-ui-core/sections';
import { PageBody } from '@pymekit/ui/page';

export const Route = createFileRoute('/admin/cms/settings')({
  component: SettingsLayout,
});

function SettingsLayout() {
  const { cmsAccess } = Route.useRouteContext();

  const visibility = getCmsSettingsTabVisibility(
    cmsAccess.status === 'ok' ? cmsAccess.access : null,
  );

  return (
    <PageBody className="py-2">
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SettingsNav visibility={visibility} />

        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </PageBody>
  );
}
