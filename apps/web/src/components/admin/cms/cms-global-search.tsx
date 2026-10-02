/**
 * Entrada «Buscar registros» de la barra lateral de la consola: abre la
 * búsqueda global del CMS (también con Cmd/Ctrl+K desde cualquier página de
 * la consola).
 *
 * La barra lateral está fuera del *layout* del CMS, así que aquí se publica
 * la API del CMS (`CmsApiProvider`) para la paleta. Solo se monta para quien
 * tiene acceso al CMS; aun así, la API y la base de datos deciden en qué
 * tablas se busca.
 *
 * [TFG] RF-09.
 */
import { SearchIcon } from 'lucide-react';

import { GlobalSearch } from '@pymekit/cms-data-explorer-ui/global-search';
import { CmsApiProvider } from '@pymekit/cms-ui-core/api-context';
import { Kbd } from '@pymekit/ui/kbd';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@pymekit/ui/sidebar';
import { Trans } from '@pymekit/ui/trans';

import { cmsApiContext } from '#/lib/cms/cms-queries.ts';

export function CmsGlobalSearch() {
  return (
    <CmsApiProvider value={cmsApiContext}>
      <GlobalSearch
        renderTrigger={({ onOpen, hydrated }) => (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                variant="outline"
                data-testid="global-search-trigger"
                data-hydrated={hydrated}
                onClick={onOpen}
              >
                <SearchIcon className="h-4" />
                <span className="flex-1">
                  <Trans i18nKey="cms.globalSearch.trigger" />
                </span>
                <Kbd className="group-data-[collapsible=icon]:hidden">
                  <Trans i18nKey="cms.globalSearch.shortcut" />
                </Kbd>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      />
    </CmsApiProvider>
  );
}
