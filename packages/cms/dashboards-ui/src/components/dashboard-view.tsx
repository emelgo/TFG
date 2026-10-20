/**
 * Ficha de un panel (`/admin/cms/dashboards/$dashboardId`, F2.8): rejilla de
 * *widgets* con sus acciones.
 *
 *  - **Rejilla:** CSS Grid de 12 columnas; cada *widget* ocupa el
 *    rectángulo de su posición guardada (`normalizePosition`).
 *  - **Organizar:** en este modo cada *widget* muestra botones para moverlo
 *    y redimensionarlo; los cambios se calculan con `applyLayoutChange`
 *    (empuja hacia abajo lo que choque) y al guardar solo se envían las
 *    posiciones que han cambiado.
 *  - **Permisos:** las acciones de edición solo aparecen con `canEdit` y las
 *    de propietario (compartir, borrar) con `canManage`; la API y RLS lo
 *    vuelven a comprobar. Cada *widget* pide sus datos para quien lo mira y
 *    se pinta «sin acceso» si no puede leer su tabla.
 *
 * [TFG] RF-11 · ADR-013.
 */
import { useState } from 'react';

import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  Copy,
  LayoutGrid,
  Minus,
  MoveHorizontal,
  MoveVertical,
  Pencil,
  Plus,
  Share2,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { CmsApi } from '@pymekit/cms-ui-core/api';
import { CMS_SECTION_PATHS } from '@pymekit/cms-ui-core/sections';
import { Badge } from '@pymekit/ui/badge';
import { Button } from '@pymekit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@pymekit/ui/card';
import { PageSummary } from '@pymekit/ui/page';

import {
  useDeleteDashboardMutation,
  useDeleteWidgetMutation,
  useRenameDashboardMutation,
  useUpdateWidgetPositionsMutation,
} from '../hooks/use-dashboard-mutations';
import {
  type GridItem,
  type LayoutChange,
  applyLayoutChange,
  getChangedPositions,
  normalizePosition,
} from '../utils/grid-layout';
import {
  type WidgetFormValues,
  widgetToFormValues,
} from '../utils/widget-form';
import { ConfirmDeleteDialog, DashboardNameDialog } from './dashboard-dialogs';
import { ShareDashboardDialog } from './share-dashboard-dialog';
import { WidgetContent } from './widget-content';
import { WidgetEditorDialog } from './widget-editor-dialog';

type DashboardDetails = Awaited<ReturnType<CmsApi['getDashboard']>>['data'];
type DashboardWidget = DashboardDetails['widgets'][number];

/** Alto de una fila de la rejilla, en píxeles. */
const ROW_HEIGHT = 72;

type DialogState =
  | { type: 'editor'; widgetId?: string; initialValues?: WidgetFormValues }
  | { type: 'deleteWidget'; widget: DashboardWidget }
  | { type: 'share' | 'rename' | 'deleteDashboard' }
  | null;

export function DashboardView(props: { data: DashboardDetails }) {
  const t = useTranslations('cms.dashboards');
  const navigate = useNavigate();
  const { dashboard, widgets, canEdit, canManage, shares } = props.data;
  const [dialog, setDialog] = useState<DialogState>(null);
  // Distribución en edición (modo «Organizar»); `null` fuera de ese modo.
  const [draft, setDraft] = useState<GridItem[] | null>(null);

  const renameDashboard = useRenameDashboardMutation();
  const deleteDashboard = useDeleteDashboardMutation();
  const deleteWidget = useDeleteWidgetMutation();
  const savePositions = useUpdateWidgetPositionsMutation();

  const saved: GridItem[] = widgets.map((widget) => ({
    id: widget.id,
    type: widget.widgetType,
    ...normalizePosition(widget.position, widget.widgetType),
  }));
  const layout = draft ?? saved;
  const positionOf = (id: string) => layout.find((item) => item.id === id);

  const saveLayout = () => {
    const updates = getChangedPositions(saved, layout);

    if (updates.length === 0) {
      setDraft(null);
      return;
    }

    savePositions.mutate(
      { dashboardId: dashboard.id, updates },
      { onSuccess: () => setDraft(null) },
    );
  };

  const permission = canManage ? 'owner' : canEdit ? 'edit' : 'view';

  return (
    <div className="flex flex-col gap-4" data-testid="dashboard-view">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            to={CMS_SECTION_PATHS.dashboards}
            className="text-muted-foreground hover:text-foreground"
            aria-label={t('actions.back')}
            data-testid="dashboard-back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h2 className="text-lg font-semibold" data-testid="dashboard-title">
            {dashboard.name}
          </h2>
          <Badge variant="outline" data-testid="dashboard-permission">
            {t(`permission.${permission}`)}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {draft ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraft(null)}
                disabled={savePositions.isPending}
              >
                {t('actions.cancel')}
              </Button>
              <Button
                type="button"
                data-testid="dashboard-layout-save"
                onClick={saveLayout}
                disabled={savePositions.isPending}
              >
                {t('actions.saveLayout')}
              </Button>
            </>
          ) : (
            <>
              {canEdit ? (
                <>
                  <Button
                    type="button"
                    data-testid="dashboard-add-widget"
                    onClick={() => setDialog({ type: 'editor' })}
                  >
                    <Plus className="h-4 w-4" />
                    {t('actions.addWidget')}
                  </Button>
                  {widgets.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      data-testid="dashboard-arrange"
                      onClick={() => setDraft(saved)}
                    >
                      <LayoutGrid className="h-4 w-4" />
                      {t('actions.arrange')}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="dashboard-rename"
                    onClick={() => setDialog({ type: 'rename' })}
                  >
                    <Pencil className="h-4 w-4" />
                    {t('actions.rename')}
                  </Button>
                </>
              ) : null}
              {canManage ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="dashboard-share"
                    onClick={() => setDialog({ type: 'share' })}
                  >
                    <Share2 className="h-4 w-4" />
                    {t('actions.share')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="dashboard-delete"
                    onClick={() => setDialog({ type: 'deleteDashboard' })}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('actions.delete')}
                  </Button>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>

      <PageSummary>{t('view.summary')}</PageSummary>

      {widgets.length === 0 ? (
        <div
          className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm"
          data-testid="dashboard-empty"
        >
          {t(canEdit ? 'view.emptyEditable' : 'view.empty')}
        </div>
      ) : (
        <div
          className="grid grid-cols-12 gap-3"
          style={{ gridAutoRows: `${ROW_HEIGHT}px` }}
          data-testid="dashboard-grid"
        >
          {widgets.map((widget) => {
            const position = positionOf(widget.id)!;

            return (
              <Card
                key={widget.id}
                className="flex min-h-0 flex-col gap-2 overflow-hidden py-3"
                style={{
                  gridColumn: `${position.x + 1} / span ${position.w}`,
                  gridRow: `${position.y + 1} / span ${position.h}`,
                }}
                data-testid="dashboard-widget"
                data-widget-title={widget.title}
                data-position={`${position.x},${position.y},${position.w},${position.h}`}
              >
                <CardHeader className="flex flex-row items-center justify-between gap-2 px-3">
                  <CardTitle className="truncate text-sm">
                    {widget.title}
                  </CardTitle>
                  {canEdit && !draft ? (
                    <div className="flex shrink-0 gap-0.5">
                      <IconButton
                        label={t('actions.editWidget')}
                        testId="widget-edit"
                        onClick={() =>
                          setDialog({
                            type: 'editor',
                            widgetId: widget.id,
                            initialValues: widgetToFormValues(widget),
                          })
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton
                        label={t('actions.duplicateWidget')}
                        testId="widget-duplicate"
                        onClick={() =>
                          setDialog({
                            type: 'editor',
                            initialValues: {
                              ...widgetToFormValues(widget),
                              title: t('widget.copyTitle', {
                                title: widget.title,
                              }).slice(0, 255),
                            },
                          })
                        }
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton
                        label={t('actions.deleteWidget')}
                        testId="widget-delete"
                        onClick={() =>
                          setDialog({ type: 'deleteWidget', widget })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  ) : null}
                </CardHeader>
                <CardContent className="min-h-0 flex-1 px-3">
                  {draft ? (
                    <ArrangeControls
                      onChange={(change) =>
                        setDraft(applyLayoutChange(layout, widget.id, change))
                      }
                    />
                  ) : (
                    <WidgetContent
                      id={widget.id}
                      widgetType={widget.widgetType}
                      config={widget.config}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {dialog?.type === 'editor' ? (
        <WidgetEditorDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          dashboardId={dashboard.id}
          widgetId={dialog.widgetId}
          initialValues={dialog.initialValues}
          positions={saved}
        />
      ) : null}

      {dialog?.type === 'deleteWidget' ? (
        <ConfirmDeleteDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={t('deleteWidget.title')}
          description={t('deleteWidget.description', {
            title: dialog.widget.title,
          })}
          onConfirm={() => deleteWidget.mutateAsync(dialog.widget.id)}
        />
      ) : null}

      {dialog?.type === 'share' ? (
        <ShareDashboardDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          dashboardId={dashboard.id}
          shares={shares}
        />
      ) : null}

      {dialog?.type === 'rename' ? (
        <DashboardNameDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          initialName={dashboard.name}
          onSubmit={(name) =>
            renameDashboard.mutateAsync({ id: dashboard.id, name })
          }
        />
      ) : null}

      {dialog?.type === 'deleteDashboard' ? (
        <ConfirmDeleteDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={t('delete.title')}
          description={t('delete.description', { name: dashboard.name })}
          onConfirm={async () => {
            await deleteDashboard.mutateAsync(dashboard.id);
            void navigate({ to: CMS_SECTION_PATHS.dashboards });
          }}
        />
      ) : null}
    </div>
  );
}

function IconButton(props: {
  label: string;
  testId: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-7 w-7"
      aria-label={props.label}
      title={props.label}
      data-testid={props.testId}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  );
}

/** Botones de mover y redimensionar del modo «Organizar». */
function ArrangeControls(props: { onChange: (change: LayoutChange) => void }) {
  const t = useTranslations('cms.dashboards.arrange');
  const controls: Array<{
    key: string;
    change: LayoutChange;
    icon: React.ReactNode;
  }> = [
    {
      key: 'left',
      change: { dx: -1 },
      icon: <ArrowLeft className="h-3.5 w-3.5" />,
    },
    {
      key: 'right',
      change: { dx: 1 },
      icon: <ArrowRight className="h-3.5 w-3.5" />,
    },
    {
      key: 'up',
      change: { dy: -1 },
      icon: <ArrowUp className="h-3.5 w-3.5" />,
    },
    {
      key: 'down',
      change: { dy: 1 },
      icon: <ArrowDown className="h-3.5 w-3.5" />,
    },
    {
      key: 'wider',
      change: { dw: 1 },
      icon: <MoveHorizontal className="h-3.5 w-3.5" />,
    },
    {
      key: 'narrower',
      change: { dw: -1 },
      icon: <Minus className="h-3.5 w-3.5" />,
    },
    {
      key: 'taller',
      change: { dh: 1 },
      icon: <MoveVertical className="h-3.5 w-3.5" />,
    },
    {
      key: 'shorter',
      change: { dh: -1 },
      icon: <Minus className="h-3.5 w-3.5 rotate-90" />,
    },
  ];

  return (
    <div className="flex h-full flex-wrap content-center items-center justify-center gap-1">
      {controls.map((control) => (
        <IconButton
          key={control.key}
          label={t(control.key)}
          testId={`widget-arrange-${control.key}`}
          onClick={() => props.onChange(control.change)}
        >
          {control.icon}
        </IconButton>
      ))}
    </div>
  );
}
