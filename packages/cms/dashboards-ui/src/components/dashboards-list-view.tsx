/**
 * Listado de paneles del CMS (`/admin/cms/dashboards`, F2.8).
 *
 * Muestra los paneles propios y los compartidos con alguno de mis roles,
 * con búsqueda y filtro (todos, míos, compartidos) guardados en la URL.
 * Cualquier miembro del CMS puede crear paneles; borrar y compartir solo
 * aparecen en los propios (`isOwner`), y la API lo vuelve a comprobar.
 *
 * [TFG] RF-11 · ADR-013.
 */
import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { LayoutDashboard, Plus, Share2, Trash2 } from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { CmsApi } from '@pymekit/cms-ui-core/api';
import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { Badge } from '@pymekit/ui/badge';
import { Button } from '@pymekit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@pymekit/ui/card';
import { Input } from '@pymekit/ui/input';
import { PageSummary } from '@pymekit/ui/page';
import { cn } from '@pymekit/ui/utils';

import {
  useCreateDashboardMutation,
  useDeleteDashboardMutation,
} from '../hooks/use-dashboard-mutations';
import type { DashboardsSearch } from '../utils/dashboards-search';
import { ConfirmDeleteDialog, DashboardNameDialog } from './dashboard-dialogs';
import { ShareDashboardDialog } from './share-dashboard-dialog';

type DashboardsList = Awaited<ReturnType<CmsApi['getDashboards']>>['data'];
type DashboardSummary = DashboardsList['dashboards'][number];

const FILTERS = ['all', 'owned', 'shared'] as const;

/** Ruta de un panel. */
export function getDashboardPath(id: string) {
  return `/admin/cms/dashboards/${id}`;
}

export function DashboardsListView(props: {
  data: DashboardsList;
  search: DashboardsSearch;
  isLoading?: boolean;
  onSearchChange: (search: DashboardsSearch) => void;
}) {
  const t = useTranslations('cms.dashboards');
  const navigate = useNavigate();
  const createDashboard = useCreateDashboardMutation();
  const [dialog, setDialog] = useState<
    | { type: 'create' }
    | { type: 'delete' | 'share'; dashboard: DashboardSummary }
    | null
  >(null);

  const filter = props.search.filter ?? 'all';
  const page = props.search.page ?? 1;
  const hasNextPage = props.data.dashboards.length >= props.data.pageSize;

  return (
    <div className="flex flex-col gap-4" data-testid="dashboards-list">
      <PageSummary>{t('list.summary')}</PageSummary>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Buscar al enviar (Intro): cada búsqueda es una navegación. */}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = new FormData(event.currentTarget).get('search');
              props.onSearchChange({
                ...props.search,
                search: String(value ?? '').trim() || undefined,
                page: undefined,
              });
            }}
          >
            <Input
              name="search"
              key={props.search.search ?? ''}
              defaultValue={props.search.search ?? ''}
              placeholder={t('list.searchPlaceholder')}
              maxLength={100}
              className="w-64"
              data-testid="dashboards-search"
            />
          </form>

          <div className="flex gap-1" role="group">
            {FILTERS.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={filter === option ? 'secondary' : 'ghost'}
                data-testid={`dashboards-filter-${option}`}
                onClick={() =>
                  props.onSearchChange({
                    ...props.search,
                    filter: option === 'all' ? undefined : option,
                    page: undefined,
                  })
                }
              >
                {t(`list.filters.${option}`)}
              </Button>
            ))}
          </div>
        </div>

        <Button
          type="button"
          data-testid="dashboard-create"
          onClick={() => setDialog({ type: 'create' })}
        >
          <Plus className="h-4 w-4" />
          {t('actions.newDashboard')}
        </Button>
      </div>

      {props.data.dashboards.length === 0 ? (
        <div
          className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-sm"
          data-testid="dashboards-empty"
        >
          <LayoutDashboard className="h-8 w-8" />
          {t('list.empty')}
        </div>
      ) : (
        <div
          className={cn(
            'grid gap-3 sm:grid-cols-2 lg:grid-cols-3',
            props.isLoading && 'opacity-60',
          )}
        >
          {props.data.dashboards.map((dashboard) => (
            <Card key={dashboard.id} data-testid="dashboard-card">
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <CardTitle className="text-base">
                  <Link
                    to={getDashboardPath(dashboard.id)}
                    className="hover:underline"
                    data-testid="dashboard-card-link"
                  >
                    {dashboard.name}
                  </Link>
                </CardTitle>
                <Badge variant="outline">
                  {t(`permission.${dashboard.permissionLevel}`)}
                </Badge>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">
                  {t('list.widgetCount', { count: dashboard.widgetCount })}
                </span>
                {dashboard.isOwner ? (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t('actions.share')}
                      data-testid="dashboard-card-share"
                      onClick={() => setDialog({ type: 'share', dashboard })}
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t('actions.delete')}
                      data-testid="dashboard-card-delete"
                      onClick={() => setDialog({ type: 'delete', dashboard })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {page > 1 || hasNextPage ? (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() =>
              props.onSearchChange({
                ...props.search,
                page: page - 1 > 1 ? page - 1 : undefined,
              })
            }
          >
            {t('list.previous')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasNextPage}
            onClick={() =>
              props.onSearchChange({ ...props.search, page: page + 1 })
            }
          >
            {t('list.next')}
          </Button>
        </div>
      ) : null}

      {dialog?.type === 'create' ? (
        <DashboardNameDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          onSubmit={async (name) => {
            const result = await createDashboard.mutateAsync(name);
            void navigate({ to: getDashboardPath(result.data.id) });
          }}
        />
      ) : null}

      {dialog?.type === 'delete' ? (
        <DeleteDashboardDialog
          dashboard={dialog.dashboard}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog?.type === 'share' ? (
        <ListShareDialog
          dashboardId={dialog.dashboard.id}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

function DeleteDashboardDialog(props: {
  dashboard: DashboardSummary;
  onClose: () => void;
}) {
  const t = useTranslations('cms.dashboards');
  const deleteDashboard = useDeleteDashboardMutation();

  return (
    <ConfirmDeleteDialog
      open
      onOpenChange={(open) => !open && props.onClose()}
      title={t('delete.title')}
      description={t('delete.description', { name: props.dashboard.name })}
      onConfirm={() => deleteDashboard.mutateAsync(props.dashboard.id)}
    />
  );
}

/** Compartir desde el listado: las comparticiones salen de la ficha. */
function ListShareDialog(props: { dashboardId: string; onClose: () => void }) {
  const { queries } = useCmsApi();
  const { data } = useQuery(queries.dashboard(props.dashboardId));

  return (
    <ShareDashboardDialog
      open
      dashboardId={props.dashboardId}
      shares={data?.data.shares ?? []}
      onOpenChange={(open) => !open && props.onClose()}
    />
  );
}
