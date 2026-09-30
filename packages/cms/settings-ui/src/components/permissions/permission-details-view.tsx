/**
 * Ajustes > Permisos > ficha de un permiso (F2.7b).
 *
 * Muestra su definición (tipo, objetivo y acción), los roles que lo tienen
 * directamente y los grupos que lo incluyen, con las acciones que la API
 * permite (`access`): editar (`can_modify_permission`: rango superior a
 * todos los roles que lo tienen, o igual si uno mismo lo tiene; cambiar la
 * capacidad exige además tenerla) y borrar (`can_delete_permission`: además,
 * que ya no esté asignado). Los permisos de sistema (`Root: *`) se
 * muestran sin acciones.
 */
import { useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { KeyRoundIcon, PencilIcon, TrashIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { CmsRbacPermissionDetails } from '@pymekit/cms-ui-core/api';
import { useIsHydrated } from '@pymekit/cms-ui-core/hydration';
import { Badge } from '@pymekit/ui/badge';
import { Button } from '@pymekit/ui/button';

import { useDeletePermissionMutation } from '../../hooks/use-rbac-mutations';
import { PermissionFormDialog } from './permission-form-dialog';
import {
  AssignedList,
  BackToPermissions,
  ConfirmDeleteDialog,
  PermissionSummary,
  RbacEntityLink,
  SystemBadge,
} from './rbac-shared';
import { Section } from './role-details-view';

type DialogState = 'none' | 'edit' | 'delete';

export function PermissionDetailsView(props: {
  data: CmsRbacPermissionDetails;
}) {
  const t = useTranslations('cms.settings.permissions');
  const hydrated = useIsHydrated();
  const navigate = useNavigate();
  const { permission, access } = props.data;
  const [dialog, setDialog] = useState<DialogState>('none');
  const closeDialog = (open: boolean) => (open ? null : setDialog('none'));
  const deleteMutation = useDeletePermissionMutation(permission.id);

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="permission-details"
      data-permission-id={permission.id}
      data-hydrated={hydrated}
    >
      <BackToPermissions tab="permissions" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1
            className="flex items-center gap-2 text-base font-medium"
            data-testid="permission-details-name"
          >
            <KeyRoundIcon className="text-muted-foreground h-4 w-4" />
            {permission.name}
            {permission.isSystem ? <SystemBadge /> : null}
          </h1>
          {permission.description ? (
            <p className="text-muted-foreground text-sm">
              {permission.description}
            </p>
          ) : null}
          <span data-testid="permission-details-summary">
            <PermissionSummary permission={permission} />
          </span>
        </div>

        <div className="flex items-center gap-2">
          {access.canUpdate ? (
            <Button
              variant="outline"
              data-testid="permission-edit"
              onClick={() => setDialog('edit')}
            >
              <PencilIcon className="h-3.5 w-3.5" />
              {t('permission.edit')}
            </Button>
          ) : null}
          {access.canDelete ? (
            <Button
              variant="destructive"
              data-testid="permission-delete"
              onClick={() => setDialog('delete')}
            >
              <TrashIcon className="h-3.5 w-3.5" />
              {t('delete')}
            </Button>
          ) : null}
        </div>
      </div>

      {permission.isSystem ? (
        <p
          className="text-muted-foreground text-sm"
          data-testid="permission-system-notice"
        >
          {t('permission.systemNotice')}
        </p>
      ) : !access.canDelete && access.canUpdate ? (
        <p className="text-muted-foreground text-xs">
          {t('permission.inUseNotice')}
        </p>
      ) : null}

      <Section
        title={t('permission.roles')}
        description={t('permission.rolesHelp')}
      >
        <AssignedList
          testId="permission-roles"
          emptyLabel={t('permission.noRoles')}
          removeLabel=""
          items={props.data.roles.map((role) => ({
            id: role.id,
            label: (
              <span className="flex items-center gap-2">
                <RbacEntityLink
                  kind="role"
                  id={role.id}
                  enabled={access.canReadRoles}
                >
                  {role.name}
                </RbacEntityLink>
                <Badge variant="secondary">
                  {t('roles.rankValue', { rank: role.rank })}
                </Badge>
              </span>
            ),
          }))}
        />
      </Section>

      <Section
        title={t('permission.groups')}
        description={t('permission.groupsHelp')}
      >
        <AssignedList
          testId="permission-groups"
          emptyLabel={t('permission.noGroups')}
          removeLabel=""
          items={props.data.groups.map((group) => ({
            id: group.id,
            label: (
              <RbacEntityLink
                kind="group"
                id={group.id}
                enabled={access.canReadPermissions}
              >
                {group.name}
              </RbacEntityLink>
            ),
          }))}
        />
      </Section>

      {dialog === 'edit' ? (
        <PermissionFormDialog
          open
          onOpenChange={closeDialog}
          permission={permission}
        />
      ) : null}

      <ConfirmDeleteDialog
        open={dialog === 'delete'}
        onOpenChange={closeDialog}
        title={t('permission.deleteTitle')}
        description={t('permission.deleteDescription', {
          name: permission.name,
        })}
        onConfirm={async () => {
          await deleteMutation.mutateAsync();
          await navigate({
            to: '/admin/cms/settings/permissions',
            search: { tab: 'permissions' },
          });
        }}
      />
    </div>
  );
}
