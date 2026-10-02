/**
 * *Layout* de la consola de administración (`/admin`).
 *
 * Guarda de entrada: el `beforeLoad` raíz ya ha resuelto `context.user` a
 * partir del JWT. Los anónimos van al inicio de sesión y los usuarios que no
 * son ni super-admin ni personal del CMS reciben un 404 (la consola no se
 * anuncia). El super-admin ve las páginas de la plataforma y el CMS; el
 * personal del CMS solo el CMS (las páginas de la plataforma lo redirigen con
 * `requirePlatformAdmin`).
 *
 * El *loader* precarga, para quien tiene acceso al CMS, las dos consultas que
 * usa la barra lateral para decidir qué entradas del CMS mostrar; así llegan
 * ya hidratadas desde el SSR. `prefetchQuery` no lanza errores: si la API
 * rechaza el acceso (por ejemplo, sin MFA), la barra lateral simplemente no
 * muestra entradas del CMS.
 *
 * [TFG] RF-08 · RF-09 · ADR-014: una sola consola para la plataforma y el CMS.
 */
import {
  Outlet,
  createFileRoute,
  notFound,
  redirect,
} from '@tanstack/react-router';

import { Page, PageMobileNavigation, PageNavigation } from '@pymekit/ui/page';
import { SidebarProvider } from '@pymekit/ui/sidebar';

import { AdminMobileNavigation } from '#/components/admin/admin-mobile-navigation.tsx';
import { AdminSidebar } from '#/components/admin/admin-sidebar.tsx';
import { AppLogo } from '#/components/app-logo.tsx';
import pathsConfig from '#/config/paths.config.ts';
import { fetchAuthGate } from '#/lib/auth/mfa.functions.ts';
import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/admin')({
  beforeLoad: async ({ context, location }) => {
    const signInHref = `${pathsConfig.auth.signIn}?next=${encodeURIComponent(location.href)}`;

    if (!context.user) {
      throw redirect({ href: signInHref });
    }

    // El JWT puede seguir pareciendo válido aunque la sesión ya no exista
    // (revocada, `db reset`…). Antes eso acababa en un 404 o en un error en
    // blanco; ahora se trata como «sin sesión» y se pide iniciarla (F3b).
    const gate = await fetchAuthGate();

    if (gate.signedOut) {
      throw redirect({ href: signInHref });
    }

    if (!context.user.is_superadmin && !context.user.has_cms_access) {
      throw notFound();
    }

    // [TFG] RNF-02 · ADR-014/016: la consola exige SIEMPRE segundo factor.
    // El claim `cms_access` no depende del nivel de la sesión (lo tiene
    // también un super-admin que solo ha escrito la contraseña), así que sin
    // esta comprobación una sesión aal1 llegaba a cargar la consola. Los datos
    // seguían protegidos (la API y la BD exigen MFA), pero la consola no debe
    // mostrarse sin verificar la identidad.
    if (context.user.aal !== 'aal2') {
      // Tiene un factor MFA configurado pero no lo ha usado en esta sesión:
      // se le pide y, al verificarlo, vuelve a la página que intentaba abrir.
      if (gate.requiresMfa) {
        throw redirect({
          href: `${pathsConfig.auth.verifyMfa}?next=${encodeURIComponent(location.href)}`,
        });
      }

      // Sin ningún factor configurado no hay forma de elevar la sesión: la
      // consola no se anuncia (404), igual que para cualquier otro usuario.
      // Debe activar primero el MFA en los ajustes de su cuenta.
      throw notFound();
    }
  },
  loader: async ({ context }) => {
    if (!context.user?.has_cms_access) {
      return;
    }

    await Promise.all([
      context.queryClient.prefetchQuery(cmsQueries.account()),
      context.queryClient.prefetchQuery(cmsQueries.navigation()),
    ]);
  },
  head: ({ match }) => ({
    meta: [{ title: getTranslator(match.context.locale)('cms.consoleTitle') }],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const { user } = Route.useRouteContext();

  return (
    <SidebarProvider>
      <Page style={'sidebar'}>
        <PageNavigation>
          <AdminSidebar user={user} />
        </PageNavigation>

        <PageMobileNavigation>
          <div>
            <AppLogo />
          </div>

          <AdminMobileNavigation user={user} />
        </PageMobileNavigation>

        <Outlet />
      </Page>
    </SidebarProvider>
  );
}
