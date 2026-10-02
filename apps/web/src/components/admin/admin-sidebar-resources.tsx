/**
 * Áreas de la barra lateral de la consola: una entrada plegable por área de
 * negocio («Blog», «Cuentas», «Facturación»…) con las tablas que el usuario
 * puede leer en el CMS.
 *
 * Las tablas llegan de `GET /v1/navigation`, que ya aplica el RBAC del CMS
 * (el personal de soporte solo ve las suyas, y por tanto solo sus áreas), y
 * se agrupan en `useAdminNavigation` (ver `admin-navigation.ts`). Cada tabla
 * muestra su nombre visible y, atenuado, el nombre técnico, para no perder
 * la referencia a la tabla real.
 *
 * Un área se abre sola si contiene la tabla abierta (o si es la única); el
 * usuario puede plegarla o desplegarla con su botón, que expone
 * `aria-expanded` (lo pone el `Collapsible` accesible de `@pymekit/ui`).
 *
 * [TFG] RF-09 · ADR-017 · ADR-020: la navegación refleja los permisos del
 * RBAC; la API vuelve a comprobarlos en cada petición.
 */
import { useState } from 'react';

import { Link, useLocation } from '@tanstack/react-router';
import { ChevronRight, Folder } from 'lucide-react';

import {
  type AreaGroup,
  isResourcePathActive,
} from '@pymekit/cms-ui-core/resources';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@pymekit/ui/collapsible';
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@pymekit/ui/sidebar';
import { Trans } from '@pymekit/ui/trans';

import { type NavigationEntry, isEntryActive } from './admin-navigation.ts';

/** Lo mínimo de un recurso de `GET /v1/navigation` que necesita la barra. */
type SidebarResource = {
  schemaName: string;
  tableName: string;
  displayName: string;
};

/** Identificador estable de un área para `data-testid` y `key`. */
export function getAreaKey(name: string | null) {
  return name ?? 'other';
}

/**
 * Texto técnico que acompaña a una tabla: solo el nombre en `public` y
 * `esquema.tabla` en los demás esquemas (`auth.users`).
 */
export function getTechnicalName(resource: SidebarResource) {
  return resource.schemaName === 'public'
    ? resource.tableName
    : `${resource.schemaName}.${resource.tableName}`;
}

export function AdminSidebarArea(props: {
  area: AreaGroup<SidebarResource>;
  /** Entrada extra al principio del área («Gestión de cuentas»). */
  leadingEntry?: NavigationEntry | null;
  defaultOpen: boolean;
}) {
  const { pathname } = useLocation();
  const key = getAreaKey(props.area.name);

  const containsActive =
    props.area.items.some((resource) =>
      isResourcePathActive(pathname, resource.schemaName, resource.tableName),
    ) ||
    (props.leadingEntry ? isEntryActive(props.leadingEntry, pathname) : false);

  // `null` = el usuario aún no lo ha tocado: se abre si contiene la ruta
  // actual. Se deriva en el render en lugar de sincronizarlo con un efecto.
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? (containsActive || props.defaultOpen);

  return (
    <Collapsible
      open={open}
      onOpenChange={setUserOpen}
      render={<SidebarMenuItem data-testid={`admin-sidebar-area-${key}`} />}
    >
      <CollapsibleTrigger
        render={
          <SidebarMenuButton
            className="group/area-trigger"
            data-testid={`admin-sidebar-area-toggle-${key}`}
          />
        }
      >
        <Folder className="h-4" />

        <span className="truncate">
          {props.area.name ?? <Trans i18nKey="cms.sidebar.otherArea" />}
        </span>

        <ChevronRight className="ml-auto transition-transform group-data-[panel-open]/area-trigger:rotate-90" />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <SidebarMenuSub>
          {props.leadingEntry ? (
            <SidebarMenuSubItem>
              <SidebarMenuSubButton
                isActive={isEntryActive(props.leadingEntry, pathname)}
                render={
                  <Link
                    to={props.leadingEntry.path}
                    data-testid="admin-sidebar-platform-accounts"
                  />
                }
              >
                <props.leadingEntry.Icon />

                <span>
                  <Trans i18nKey={props.leadingEntry.labelKey} />
                </span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ) : null}

          {props.area.items.map((resource) => (
            <SidebarMenuSubItem
              key={`${resource.schemaName}.${resource.tableName}`}
            >
              <SidebarMenuSubButton
                isActive={isResourcePathActive(
                  pathname,
                  resource.schemaName,
                  resource.tableName,
                )}
                title={`${resource.displayName} (${getTechnicalName(resource)})`}
                render={
                  <Link
                    to="/admin/cms/resources/$schema/$table"
                    params={{
                      schema: resource.schemaName,
                      table: resource.tableName,
                    }}
                    data-testid={`admin-sidebar-resource-${resource.schemaName}.${resource.tableName}`}
                  />
                }
              >
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate">{resource.displayName}</span>

                  <span className="text-muted-foreground truncate font-mono text-[10px]">
                    {getTechnicalName(resource)}
                  </span>
                </span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}
