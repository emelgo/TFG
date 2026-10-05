/**
 * Ajustes > Permisos > ficha de un grupo de permisos (F2.7b).
 *
 * Muestra los permisos del grupo y los roles que lo usan (los que el
 * usuario puede ver: su rol y los de rango inferior), con las acciones que
 * la API permite (`access`): editar y borrar (`can_modify_permission_group`:
 * rango igual o superior a todos los roles que lo usan para editar, y
 * estrictamente superior, sin tenerlo uno mismo, para borrar) y añadir o
 * quitar permisos (`can_modify_permission_group_permissions`; solo se
 * ofrecen los que el usuario puede conceder). El grupo de sistema (Super
 * Admin) se muestra sin acciones.
 */
import { useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { FolderLockIcon, PencilIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { CmsRbacGroupDetails } from '@pymekit/cms-ui-core/api';
import { useIsHydrated } from '@pymekit/cms-ui-core/hydration';
import { Badge } from '@pymekit/ui/badge';
import { Button } from '@pymekit/ui/button';
import { PageSummary } from '@pymekit/ui/page';

import {
  useDeleteGroupMutation,
  useGroupPermissionsMutation,
} from '../../hooks/use-rbac-mutations';
import { buildAssignmentChanges } from '../../utils/rbac-forms';
import { GroupFormDialog } from './rbac-form-dialogs';
import {
  AssignItemsDialog,
  AssignedList,
  BackToPermissions,
  ConfirmDeleteDialog,
  PermissionSummary,
  RbacEntityLink,
  SystemBadge,
} from './rbac-shared';
import { Section } from './role-details-view';

type DialogState = 'none' | 'edit' | 'delete' | 'permissions';

export function GroupDetailsView(props: { data: CmsRbacGroupDetails }) {
  const t = useTranslations('cms.settings.permissions');
  const hydrated = useIsHydrated();
  const navigate = useNavigate();
  const { group, access } = props.data;
  const [dialog, setDialog] = useState<DialogState>('none');
  const closeDialog = (open: boolean) => (open ? null : setDialog('none'));

  const deleteMutation = useDeleteGroupMutation(group.id);
  const permissionsMutation = useGroupPermissionsMutation(group.id);

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="group-details"
      data-group-id={group.id}
      data-hydrated={hydrated}
    >
      <BackToPermissions tab="groups" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1
            className="flex items-center gap-2 text-base font-medium"
            data-testid="group-details-name"
          >
            <FolderLockIcon className="text-muted-foreground h-4 w-4" />
            {group.name}
            {group.isSystem ? <SystemBadge /> : null}
          </h1>
          {group.description ? (
            <p className="text-muted-foreground text-sm">{group.description}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {access.canUpdate ? (
            <Button
              variant="outline"
              data-testid="group-edit"
              onClick={() => setDialog('edit')}
            >
              <PencilIcon className="h-3.5 w-3.5" />
              {t('groups.edit')}
            </Button>
          ) : null}
          {access.canDelete ? (
            <Button
              variant="destructive"
              data-testid="group-delete"
              onClick={() => setDialog('delete')}
            >
              <TrashIcon className="h-3.5 w-3.5" />
              {t('delete')}
            </Button>
          ) : null}
        </div>
      </div>

      <PageSummary>{t('details.groupSummary')}</PageSummary>

      {group.isSystem ? (
        <p
          className="text-muted-foreground text-sm"
          data-testid="group-system-notice"
        >
          {t('groups.systemNotice')}
        </p>
      ) : null}

      <Section
        title={t('groups.permissions')}
        description={t('groups.permissionsHelp')}
        action={
          access.canAddPermissions ? (
            <Button
              size="sm"
              variant="outline"
              data-testid="group-add-permissions"
              onClick={() => setDialog('permissions')}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              {t('groups.addPermissions')}
            </Button>
          ) : null
        }
      >
        <AssignedList
          testId="group-permissions"
          emptyLabel={t('groups.noPermissions')}
          removeLabel={t('remove')}
          isRemoving={permissionsMutation.isPending}
          onRemove={
            access.canRemovePermissions
              ? (permissionId) =>
                  void permissionsMutation
                    .mutateAsync({ toAdd: [], toRemove: [permissionId] })
                    .catch(() => undefined)
              : undefined
          }
          items={props.data.permissions.map((permission) => ({
            id: permission.id,
            label: (
              <span className="flex flex-col gap-1">
                <RbacEntityLink
                  kind="permission"
                  id={permission.id}
                  enabled={access.canReadPermissions}
                  className="font-medium"
                >
                  {permission.name}
                </RbacEntityLink>
                <PermissionSummary permission={permission} />
              </span>
            ),
          }))}
        />
      </Section>

      <Section title={t('groups.roles')} description={t('groups.rolesHelp')}>
        <AssignedList
          testId="group-roles"
          emptyLabel={t('groups.noRoles')}
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

      {dialog === 'edit' ? (
        <GroupFormDialog open onOpenChange={closeDialog} group={group} />
      ) : null}

      {dialog === 'permissions' ? (
        <AssignItemsDialog
          open
          onOpenChange={closeDialog}
          title={t('groups.addPermissionsTitle')}
          description={t('groups.addPermissionsDescription')}
          emptyLabel={t('roles.noAssignablePermissions')}
          options={props.data.assignablePermissions.map((permission) => ({
            id: permission.id,
            name: permission.name,
            description: permission.description,
            detail: <PermissionSummary permission={permission} />,
          }))}
          onSubmit={async (ids) => {
            const changes = buildAssignmentChanges(
              props.data.permissions.map((permission) => permission.id),
              ids,
            );

            if (changes) {
              await permissionsMutation.mutateAsync(changes);
            }
          }}
        />
      ) : null}

      <ConfirmDeleteDialog
        open={dialog === 'delete'}
        onOpenChange={closeDialog}
        title={t('groups.deleteTitle')}
        description={t('groups.deleteDescription', { name: group.name })}
        onConfirm={async () => {
          await deleteMutation.mutateAsync();
          await navigate({
            to: '/admin/cms/settings/permissions',
            search: { tab: 'groups' },
          });
        }}
      />
    </div>
  );
}
