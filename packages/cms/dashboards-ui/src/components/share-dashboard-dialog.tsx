/**
 * Diálogo para compartir un panel con roles del CMS (F2.8).
 *
 * Solo lo abre el propietario (`canManage` de la API). Ofrece los roles de
 * `GET /v1/roles/sharing` (rango estrictamente inferior al propio) y, para
 * cada uno, «ver» o «editar». La API y `cms.share_dashboard_with_role`
 * vuelven a comprobar la propiedad y el rango (`DASHBOARD_SHARE_RANK_DENIED`).
 *
 * [TFG] RF-11 · ADR-013.
 */
import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { DashboardShareLevel } from '@pymekit/cms-shared/dashboards';
import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { Badge } from '@pymekit/ui/badge';
import { Button } from '@pymekit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pymekit/ui/dialog';
import { Field } from '@pymekit/ui/field';
import { FieldLabelWithHelp } from '@pymekit/ui/field-help';
import { NativeSelect, NativeSelectOption } from '@pymekit/ui/native-select';

import {
  useShareDashboardMutation,
  useUnshareDashboardMutation,
} from '../hooks/use-dashboard-mutations';

export function ShareDashboardDialog(props: {
  dashboardId: string;
  shares: Array<{ roleId: string; permissionLevel: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('cms.dashboards.share');
  const { queries } = useCmsApi();
  const { data, isLoading } = useQuery({
    ...queries.rolesForSharing(),
    enabled: props.open,
  });
  const share = useShareDashboardMutation();
  const unshare = useUnshareDashboardMutation();
  const [selection, setSelection] = useState({
    roleId: '',
    level: 'view' as DashboardShareLevel,
  });

  const roles = data?.roles ?? [];
  const roleName = (roleId: string) =>
    roles.find((role) => role.id === roleId)?.name ?? roleId.slice(0, 8);
  const isBusy = share.isPending || unshare.isPending;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent data-testid="share-dashboard-dialog">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2" data-testid="dashboard-shares">
          {props.shares.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('none')}</p>
          ) : (
            props.shares.map((current) => (
              <div
                key={current.roleId}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                data-testid="dashboard-share-row"
              >
                <span className="text-sm font-medium">
                  {roleName(current.roleId)}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {t(current.permissionLevel === 'edit' ? 'edit' : 'view')}
                  </Badge>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t('remove')}
                    data-testid="dashboard-share-remove"
                    disabled={isBusy}
                    onClick={() =>
                      unshare.mutate({
                        id: props.dashboardId,
                        roleId: current.roleId,
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Formulario mínimo de dos selectores: no necesita TanStack Form. */}
        <form
          className="flex flex-col gap-3 border-t pt-4"
          onSubmit={(event) => {
            event.preventDefault();

            if (selection.roleId) {
              share.mutate(
                {
                  id: props.dashboardId,
                  roleId: selection.roleId,
                  permissionLevel: selection.level,
                },
                {
                  onSuccess: () => setSelection({ roleId: '', level: 'view' }),
                },
              );
            }
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabelWithHelp htmlFor="share-role" help={t('roleHelp')}>
                {t('role')}
              </FieldLabelWithHelp>
              <NativeSelect
                id="share-role"
                data-testid="share-role-select"
                className="w-full"
                disabled={isLoading}
                value={selection.roleId}
                onChange={(event) =>
                  setSelection({ ...selection, roleId: event.target.value })
                }
              >
                <NativeSelectOption value="">
                  {t('chooseRole')}
                </NativeSelectOption>
                {roles.map((role) => (
                  <NativeSelectOption key={role.id} value={role.id}>
                    {role.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabelWithHelp htmlFor="share-level" help={t('levelHelp')}>
                {t('level')}
              </FieldLabelWithHelp>
              <NativeSelect
                id="share-level"
                data-testid="share-level-select"
                className="w-full"
                value={selection.level}
                onChange={(event) =>
                  setSelection({
                    ...selection,
                    level: event.target.value as DashboardShareLevel,
                  })
                }
              >
                <NativeSelectOption value="view">
                  {t('view')}
                </NativeSelectOption>
                <NativeSelectOption value="edit">
                  {t('edit')}
                </NativeSelectOption>
              </NativeSelect>
            </Field>
          </div>

          {!isLoading && roles.length === 0 ? (
            <p className="text-muted-foreground text-xs">{t('noRoles')}</p>
          ) : null}

          <Button
            type="submit"
            data-testid="share-submit"
            disabled={!selection.roleId || isBusy}
          >
            {t('submit')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
