/**
 * Grupo «Recursos» de la barra lateral de la consola: acceso directo al
 * listado de cada tabla que el usuario puede leer en el CMS.
 *
 * Las tablas llegan de `GET /v1/navigation`, que ya aplica el RBAC del CMS
 * (el personal de soporte solo ve las suyas). Se agrupan por esquema cuando
 * hay más de uno, se limitan a `SIDEBAR_RESOURCES_LIMIT` (el resto se ve en
 * la portada del CMS) y la lista tiene altura máxima con desplazamiento para
 * no empujar el resto de la barra. El grupo se puede plegar.
 *
 * [TFG] RF-09 · ADR-017: la navegación refleja los permisos del RBAC; la API
 * vuelve a comprobarlos en cada petición.
 */
import { Link, useLocation } from '@tanstack/react-router';
import { ChevronDown, Table2 } from 'lucide-react';

import { isResourcePathActive } from '@pymekit/cms-ui-core/resources';
import type { JWTUserData } from '@pymekit/supabase/types';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@pymekit/ui/collapsible';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@pymekit/ui/sidebar';
import { Trans } from '@pymekit/ui/trans';

import { useCmsSidebarResources } from './admin-navigation.ts';

export function AdminSidebarResources(props: { user: JWTUserData | null }) {
  const { pathname } = useLocation();
  const { groups, showSchemaLabels, hiddenCount } = useCmsSidebarResources(
    props.user,
  );

  if (groups.length === 0) {
    return null;
  }

  return (
    <Collapsible
      defaultOpen
      render={
        <SidebarGroup
          data-testid="admin-sidebar-resources-group"
          // Con la barra plegada a iconos, una lista de tablas sin texto no
          // sirve: se oculta y se usa la entrada «Explorador de datos».
          className="group-data-[collapsible=icon]:hidden"
        />
      }
    >
      <SidebarGroupLabel
        render={
          <CollapsibleTrigger
            className="group/resources-trigger w-full"
            data-testid="admin-sidebar-resources-toggle"
          />
        }
      >
        <Trans i18nKey="cms.sidebar.resourcesGroup" />

        <ChevronDown className="ml-auto transition-transform group-data-[panel-open]/resources-trigger:rotate-180" />
      </SidebarGroupLabel>

      <CollapsibleContent>
        <SidebarGroupContent className="max-h-[40vh] overflow-y-auto">
          {groups.map((group) => (
            <div
              key={group.schemaName}
              data-testid={`admin-sidebar-resources-schema-${group.schemaName}`}
            >
              {showSchemaLabels ? (
                <div className="text-muted-foreground px-2 pt-2 pb-1 font-mono text-xs">
                  {group.schemaName}
                </div>
              ) : null}

              <SidebarMenu>
                {group.items.map((resource) => (
                  <SidebarMenuItem
                    key={`${resource.schemaName}.${resource.tableName}`}
                  >
                    <SidebarMenuButton
                      size="sm"
                      isActive={isResourcePathActive(
                        pathname,
                        resource.schemaName,
                        resource.tableName,
                      )}
                      render={
                        <Link
                          className="flex size-full gap-2"
                          to="/admin/cms/resources/$schema/$table"
                          params={{
                            schema: resource.schemaName,
                            table: resource.tableName,
                          }}
                          title={resource.displayName ?? resource.tableName}
                          data-testid={`admin-sidebar-resource-${resource.schemaName}.${resource.tableName}`}
                        />
                      }
                    >
                      <Table2 className="h-4" />

                      <span className="truncate">
                        {resource.displayName ?? resource.tableName}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </div>
          ))}

          {hiddenCount > 0 ? (
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
                  render={
                    <Link
                      to="/admin/cms"
                      data-testid="admin-sidebar-resources-view-all"
                    />
                  }
                >
                  <span className="text-muted-foreground">
                    <Trans
                      i18nKey="cms.sidebar.resourcesViewAll"
                      values={{ count: hiddenCount }}
                    />
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          ) : null}
        </SidebarGroupContent>
      </CollapsibleContent>
    </Collapsible>
  );
}
