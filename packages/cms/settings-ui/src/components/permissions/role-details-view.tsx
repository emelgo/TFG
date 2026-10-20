/**
 * Ajustes > Permisos > ficha de un rol (F2.7b).
 *
 * Muestra el rango y la descripción del rol, sus grupos de permisos, sus
 * permisos directos y los miembros que lo tienen, con las acciones que la
 * API dice que el usuario puede hacer (`access`):
 *
 *  - editar (`canUpdate`: `role:update` y rango superior al del rol);
 *  - borrar (`canDelete`: además, sin miembros);
 *  - asignar o quitar grupos (`canAddGroups`/`canRemoveGroups`) y permisos
 *    directos (`canAddPermissions`/`canRemovePermissions`); los diálogos
 *    solo ofrecen lo que el usuario puede conceder
 *    (`assignableGroups`/`assignablePermissions`).
 *
 * El rol de sistema (Root) se muestra sin ninguna acción. Ocultar un botón
 * es solo ayuda visual: la API y la base de datos repiten todas las
 * comprobaciones.
 */
import { useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { PencilIcon, PlusIcon, ShieldIcon, TrashIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { CmsRbacRoleDetails } from '@pymekit/cms-ui-core/api';
import { useIsHydrated } from '@pymekit/cms-ui-core/hydration';
import { Badge } from '@pymekit/ui/badge';
import { Button } from '@pymekit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pymekit/ui/card';
import { PageSummary } from '@pymekit/ui/page';

import {
  useDeleteRoleMutation,
  useRoleGroupsMutation,
  useRolePermissionsMutation,
} from '../../hooks/use-rbac-mutations';
import { buildAssignmentChanges } from '../../utils/rbac-forms';
import { RoleFormDialog } from './rbac-form-dialogs';
import {
  AssignItemsDialog,
  AssignedList,
  BackToPermissions,
  ConfirmDeleteDialog,
  PermissionSummary,
  RbacEntityLink,
  SystemBadge,
} from './rbac-shared';

type DialogState = 'none' | 'edit' | 'delete' | 'groups' | 'permissions';

export function RoleDetailsView(props: { data: CmsRbacRoleDetails }) {
  const t = useTranslations('cms.settings.permissions');
  const hydrated = useIsHydrated();
  const navigate = useNavigate();
  const { role, access } = props.data;
  const [dialog, setDialog] = useState<DialogState>('none');
  const closeDialog = (open: boolean) => (open ? null : setDialog('none'));

  const deleteMutation = useDeleteRoleMutation(role.id);
  const groupsMutation = useRoleGroupsMutation(role.id);
  const permissionsMutation = useRolePermissionsMutation(role.id);

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="role-details"
      data-role-id={role.id}
      data-hydrated={hydrated}
    >
      <BackToPermissions tab="roles" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1
            className="flex items-center gap-2 text-base font-medium"
            data-testid="role-details-name"
          >
            <ShieldIcon className="text-muted-foreground h-4 w-4" />
            {role.name}
            {role.isSystem ? <SystemBadge /> : null}
          </h1>
          {role.description ? (
            <p className="text-muted-foreground text-sm">{role.description}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {access.canUpdate ? (
            <Button
              variant="outline"
              data-testid="role-edit"
              onClick={() => setDialog('edit')}
            >
              <PencilIcon className="h-3.5 w-3.5" />
              {t('roles.edit')}
            </Button>
          ) : null}
          {access.canDelete ? (
            <Button
              variant="destructive"
              data-testid="role-delete"
              onClick={() => setDialog('delete')}
            >
              <TrashIcon className="h-3.5 w-3.5" />
              {t('delete')}
            </Button>
          ) : null}
        </div>
      </div>

      <PageSummary>{t('details.roleSummary')}</PageSummary>

      {role.isSystem ? (
        <p
          className="text-muted-foreground text-sm"
          data-testid="role-system-notice"
        >
          {t('roles.systemNotice')}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm">{t('roles.rank')}</CardTitle>
            <CardDescription className="text-xs">
              {t('roles.rankCardHelp')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary" data-testid="role-details-rank">
              {role.rank}
            </Badge>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm">{t('roles.members')}</CardTitle>
            <CardDescription className="text-xs">
              {t('roles.membersHelp')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Quién tiene el rol solo con `account:select`; si no, el número. */}
            {!access.canReadMembers ? (
              <Badge variant="secondary" data-testid="role-member-count">
                {t('roles.memberCount', { count: role.memberCount })}
              </Badge>
            ) : (
              <AssignedList
                testId="role-members"
                emptyLabel={t('roles.noMembers')}
                removeLabel=""
                items={props.data.members.map((member) => ({
                  id: member.id,
                  label: (
                    <span className="flex items-center gap-2">
                      {member.displayName || member.id}
                      {member.isActive ? null : (
                        <Badge variant="outline">{t('roles.inactive')}</Badge>
                      )}
                    </span>
                  ),
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Section
        title={t('roles.groups')}
        description={t('roles.groupsHelp')}
        action={
          access.canAddGroups ? (
            <Button
              size="sm"
              variant="outline"
              data-testid="role-add-groups"
              onClick={() => setDialog('groups')}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              {t('roles.addGroups')}
            </Button>
          ) : null
        }
      >
        <AssignedList
          testId="role-groups"
          emptyLabel={t('roles.noGroups')}
          removeLabel={t('remove')}
          isRemoving={groupsMutation.isPending}
          onRemove={
            access.canRemoveGroups
              ? (groupId) =>
                  void groupsMutation
                    .mutateAsync({ toAdd: [], toRemove: [groupId] })
                    .catch(() => undefined)
              : undefined
          }
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

      <Section
        title={t('roles.permissions')}
        description={t('roles.permissionsHelp')}
        action={
          access.canAddPermissions ? (
            <Button
              size="sm"
              variant="outline"
              data-testid="role-add-permissions"
              onClick={() => setDialog('permissions')}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              {t('roles.addPermissions')}
            </Button>
          ) : null
        }
      >
        <AssignedList
          testId="role-permissions"
          emptyLabel={t('roles.noPermissions')}
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

      {dialog === 'edit' ? (
        <RoleFormDialog
          open
          onOpenChange={closeDialog}
          role={role}
          maxRank={access.maxRank}
          takenRanks={props.data.takenRanks}
        />
      ) : null}

      {dialog === 'groups' ? (
        <AssignItemsDialog
          open
          onOpenChange={closeDialog}
          title={t('roles.addGroupsTitle')}
          description={t('roles.addGroupsDescription')}
          emptyLabel={t('roles.noAssignableGroups')}
          options={props.data.assignableGroups}
          onSubmit={async (ids) => {
            const changes = buildAssignmentChanges(
              props.data.groups.map((group) => group.id),
              ids,
            );

            if (changes) {
              await groupsMutation.mutateAsync(changes);
            }
          }}
        />
      ) : null}

      {dialog === 'permissions' ? (
        <AssignItemsDialog
          open
          onOpenChange={closeDialog}
          title={t('roles.addPermissionsTitle')}
          description={t('roles.addPermissionsDescription')}
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
        title={t('roles.deleteTitle')}
        description={t('roles.deleteDescription', { name: role.name })}
        onConfirm={async () => {
          await deleteMutation.mutateAsync();
          await navigate({
            to: '/admin/cms/settings/permissions',
            search: { tab: 'roles' },
          });
        }}
      />
    </div>
  );
}

/** Sección con título, ayuda y una acción opcional. */
export function Section(
  props: React.PropsWithChildren<{
    title: string;
    description: string;
    action?: React.ReactNode;
  }>,
) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="text-sm font-medium">{props.title}</h2>
          <p className="text-muted-foreground text-xs">{props.description}</p>
        </div>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}
