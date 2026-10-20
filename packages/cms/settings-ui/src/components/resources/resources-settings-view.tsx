/**
 * Ajustes > Recursos (F2.7c): tablas gestionadas por el CMS agrupadas por
 * área de negocio (la misma agrupación que la barra lateral), con su visibilidad en el explorador, su orden y el acceso a la
 * configuración de cada una. Incluye la acción «Sincronizar tablas», que
 * vuelve a leer del catálogo de PostgreSQL las tablas de un esquema.
 *
 * Los controles solo se activan con `permissions.canUpdate` (permiso de
 * sistema `table:update`); la API lo vuelve a comprobar y rechaza los
 * esquemas protegidos.
 *
 * [TFG] RF-09 · ADR-013 · ADR-014.
 */
import { useState } from 'react';

import { Link } from '@tanstack/react-router';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DatabaseIcon,
  RefreshCwIcon,
  Settings2Icon,
} from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { CmsResourceSettingsList } from '@pymekit/cms-ui-core/api';
import { useIsHydrated } from '@pymekit/cms-ui-core/hydration';
import { Button } from '@pymekit/ui/button';
import { PageSummary } from '@pymekit/ui/page';
import { Switch } from '@pymekit/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pymekit/ui/table';

import { useUpdateTablesMetadataMutation } from '../../hooks/use-resource-settings-mutations';
import { groupTablesByArea, moveTable } from '../../utils/resource-settings';
import { SyncTablesDialog } from './sync-tables-dialog';

export function ResourcesSettingsView(props: {
  data: CmsResourceSettingsList;
}) {
  const t = useTranslations('cms.settings.resources');
  const hydrated = useIsHydrated();
  const [syncOpen, setSyncOpen] = useState(false);
  const mutation = useUpdateTablesMetadataMutation();

  const canUpdate = props.data.permissions.canUpdate;
  const groups = groupTablesByArea(props.data.tables);
  const busy = !canUpdate || mutation.isPending;

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="resources-settings-view"
      data-hydrated={hydrated}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-sm font-medium">
          <DatabaseIcon className="text-muted-foreground h-4 w-4" />
          {t('title')}
        </h1>

        {canUpdate ? (
          <Button
            size="sm"
            variant="outline"
            data-testid="resources-sync-button"
            onClick={() => setSyncOpen(true)}
          >
            <RefreshCwIcon className="h-3.5 w-3.5" />
            {t('sync.action')}
          </Button>
        ) : null}
      </div>

      <PageSummary>{t('description')}</PageSummary>

      {groups.length === 0 ? (
        <p
          className="text-muted-foreground text-sm"
          data-testid="resources-empty"
        >
          {t('empty')}
        </p>
      ) : null}

      {groups.map((group) => (
        <section
          key={group.name ?? ''}
          className="flex flex-col gap-1"
          data-testid={`resources-area-${group.name ?? 'other'}`}
        >
          <h2 className="text-muted-foreground text-xs font-medium uppercase">
            {group.name ?? t('otherArea')}
          </h2>

          {/* Una tabla por área: con `table-fixed` y anchos explícitos, todas
              las columnas quedan alineadas entre áreas (con el ancho
              automático, cada tabla medía sus columnas según su contenido).
              El ancho mínimo evita que en el móvil se aplasten: la tabla se
              desplaza en horizontal. */}
          <Table className="min-w-[640px] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[38%]">{t('columns.table')}</TableHead>
                <TableHead>{t('columns.displayName')}</TableHead>
                <TableHead className="w-24">{t('columns.visible')}</TableHead>
                <TableHead className="w-24">{t('columns.order')}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {group.items.map((table, index) => {
                const id = `${table.schemaName}.${table.tableName}`;

                return (
                  <TableRow key={id} data-testid={`resource-row-${id}`}>
                    <TableCell className="truncate font-mono text-xs">
                      {table.schemaName === 'public'
                        ? table.tableName
                        : `${table.schemaName}.${table.tableName}`}
                    </TableCell>
                    <TableCell className="truncate">
                      {table.displayName ?? ''}
                    </TableCell>
                    <TableCell>
                      <Switch
                        aria-label={t('columns.visible')}
                        data-testid={`resource-visible-${id}`}
                        checked={table.isVisible !== false}
                        disabled={busy}
                        onCheckedChange={(checked) =>
                          mutation.mutate([
                            {
                              schema: table.schemaName,
                              table: table.tableName,
                              isVisible: checked,
                            },
                          ])
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {([-1, 1] as const).map((direction) => {
                          const next = moveTable(group.items, index, direction);
                          const Icon =
                            direction === -1 ? ArrowUpIcon : ArrowDownIcon;

                          return (
                            <Button
                              key={direction}
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t(
                                direction === -1 ? 'moveUp' : 'moveDown',
                              )}
                              disabled={busy || !next}
                              onClick={() => next && mutation.mutate(next)}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </Button>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/admin/cms/settings/resources/$schema/$table"
                        params={{
                          schema: table.schemaName,
                          table: table.tableName,
                        }}
                        aria-label={t('configure')}
                        data-testid={`resource-configure-${id}`}
                        className="hover:bg-muted inline-flex size-8 items-center justify-center rounded-md"
                      >
                        <Settings2Icon className="h-3.5 w-3.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      ))}

      {canUpdate ? (
        <SyncTablesDialog open={syncOpen} onOpenChange={setSyncOpen} />
      ) : null}
    </div>
  );
}
