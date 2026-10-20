/**
 * Carpetas del bloque «Datos» de la barra lateral de la consola: una entrada
 * plegable por área de negocio («Blog», «Cuentas», «Facturación»…) con las
 * tablas que el usuario puede leer en el CMS.
 *
 * Las tablas llegan de `GET /v1/navigation`, que ya aplica el RBAC del CMS
 * (el personal de soporte solo ve las suyas, y por tanto solo sus áreas), y
 * se agrupan en `useAdminNavigation` (ver `admin-navigation.ts`).
 *
 * La carpeta lleva icono (es de primer nivel) y las tablas no. Cada tabla
 * muestra solo su nombre visible, completo salvo que de verdad no quepa; el
 * nombre técnico (`esquema.tabla`) queda en el `title`, al pasar el ratón,
 * y en la vista «Todas las tablas», para quien necesite la tabla real.
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

/** Nombre técnico de una tabla (`esquema.tabla`), para el `title`. */
export function getQualifiedName(resource: SidebarResource) {
  return `${resource.schemaName}.${resource.tableName}`;
}

export function AdminSidebarArea(props: {
  area: AreaGroup<SidebarResource>;
  defaultOpen: boolean;
}) {
  const { pathname } = useLocation();
  const key = getAreaKey(props.area.name);

  const containsActive = props.area.items.some((resource) =>
    isResourcePathActive(pathname, resource.schemaName, resource.tableName),
  );

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
            className="group/area-trigger gap-2.5"
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
                title={getQualifiedName(resource)}
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
                <span>{resource.displayName}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}
