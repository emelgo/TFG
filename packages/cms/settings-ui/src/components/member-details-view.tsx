/**
 * Ajustes > Miembros > ficha de un miembro del CMS (F2.7a).
 *
 * Muestra la cuenta (nombre, correo de Auth, estado, rol e identificadores),
 * las acciones que la API dice que el usuario actual puede hacer con ella
 * (`access`) y su registro de auditoría (`MemberAuditLogs`, que a su vez
 * respeta la jerarquía de rangos de `cms.can_read_audit_log`).
 *
 *  - Cambiar el rol: `access.canAssignRole` (asignar: `role:insert`, más
 *    `role:delete` si ya tiene uno, cuenta activa y rango superior; solo se
 *    ofrecen roles de rango inferior) o `access.canRemoveRole` (quitarlo).
 *  - Activar o desactivar: `access.canChangeStatus`, con confirmación.
 *  - Sobre uno mismo o sobre una cuenta raíz (super-admin de la plataforma)
 *    no se ofrece ninguna acción y se explica por qué.
 *
 * Ocultar un botón es solo ayuda visual: la API y la base de datos
 * (`set_account_active`, `can_modify_account_role`, RLS) repiten todas las
 * comprobaciones.
 */
import { useState } from 'react';

import { Link } from '@tanstack/react-router';
import {
  ChevronLeftIcon,
  InfoIcon,
  MailIcon,
  ShieldCheckIcon,
  ShieldIcon,
  ShieldMinusIcon,
  ShieldUserIcon,
} from 'lucide-react';
import { useTranslations } from 'use-intl';

import { MemberAuditLogs } from '@pymekit/cms-audit-logs-ui/components';
import { useDateFormatter } from '@pymekit/cms-formatters/hooks';
import type { CmsMemberDetails } from '@pymekit/cms-ui-core/api';
import { useIsHydrated } from '@pymekit/cms-ui-core/hydration';
import { CMS_SETTINGS_TAB_PATHS } from '@pymekit/cms-ui-core/sections';
import { Alert, AlertDescription } from '@pymekit/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pymekit/ui/alert-dialog';
import { Badge } from '@pymekit/ui/badge';
import { Button } from '@pymekit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pymekit/ui/card';
import { Spinner } from '@pymekit/ui/spinner';

import { useMemberStatusMutation } from '../hooks/use-settings-mutations';
import { ManageMemberRoleDialog } from './manage-member-role-dialog';
import { MemberStatusBadge } from './member-badges';

type DialogState = 'none' | 'role' | 'status';

export function MemberDetailsView(props: { data: CmsMemberDetails }) {
  const t = useTranslations('cms.settings.members');
  const hydrated = useIsHydrated();
  const formatDate = useDateFormatter();
  const { member, access, assignableRoles } = props.data;
  const [dialog, setDialog] = useState<DialogState>('none');
  const statusMutation = useMemberStatusMutation(member.id);

  const title = member.displayName ?? member.email ?? member.id;

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="member-details"
      data-member-id={member.id}
      data-hydrated={hydrated}
    >
      <Link
        to={CMS_SETTINGS_TAB_PATHS.members}
        data-testid="member-details-back"
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-xs"
      >
        <ChevronLeftIcon className="h-3.5 w-3.5" />
        {t('back')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1
            className="flex items-center gap-2 text-base font-medium"
            data-testid="member-details-name"
          >
            {title}
            {access.isSelf ? (
              <Badge variant="secondary">{t('you')}</Badge>
            ) : null}
            {access.isProtected ? (
              <Badge variant="outline" data-testid="member-details-protected">
                <ShieldIcon className="h-3 w-3" />
                {t('platformManaged')}
              </Badge>
            ) : null}
          </h1>

          {member.email ? (
            <span
              className="text-muted-foreground flex items-center gap-1 text-sm"
              data-testid="member-details-email"
            >
              <MailIcon className="h-3.5 w-3.5" />
              {member.email}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {access.canAssignRole || access.canRemoveRole ? (
            <Button
              variant="outline"
              data-testid="member-manage-role"
              onClick={() => setDialog('role')}
            >
              <ShieldUserIcon className="h-3.5 w-3.5" />
              {t('role.manage')}
            </Button>
          ) : null}

          {access.canChangeStatus ? (
            member.isActive ? (
              <Button
                variant="destructive"
                data-testid="member-deactivate"
                onClick={() => setDialog('status')}
              >
                <ShieldMinusIcon className="h-3.5 w-3.5" />
                {t('status.deactivate')}
              </Button>
            ) : (
              <Button
                data-testid="member-activate"
                onClick={() => setDialog('status')}
              >
                <ShieldCheckIcon className="h-3.5 w-3.5" />
                {t('status.activate')}
              </Button>
            )
          ) : null}
        </div>
      </div>

      {access.isSelf || access.isProtected ? (
        <Alert data-testid="member-details-no-actions">
          <InfoIcon className="h-4 w-4" />
          <AlertDescription>
            {access.isSelf ? t('selfNotice') : t('protectedNotice')}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InfoCard title={t('cards.status')} description={t('cards.statusHelp')}>
          <MemberStatusBadge active={member.isActive} />
        </InfoCard>

        <InfoCard title={t('cards.role')} description={t('cards.roleHelp')}>
          <Badge variant="secondary" data-testid="member-details-role">
            {member.role
              ? t('role.option', {
                  name: member.role.name,
                  rank: member.role.rank ?? 0,
                })
              : t('noRole')}
          </Badge>
        </InfoCard>

        <InfoCard
          title={t('cards.accountId')}
          description={t('cards.joined', {
            date: formatDate(new Date(member.createdAt), 'dd MMM yyyy'),
          })}
        >
          <code className="bg-muted rounded px-1 py-0.5 text-xs break-all">
            {member.id}
          </code>
        </InfoCard>

        <InfoCard
          title={t('cards.authUserId')}
          description={t('cards.authUserIdHelp')}
        >
          <code className="bg-muted rounded px-1 py-0.5 text-xs break-all">
            {member.authUserId}
          </code>
        </InfoCard>
      </div>

      <MemberAuditLogs accountId={member.id} />

      {dialog === 'role' ? (
        <ManageMemberRoleDialog
          member={member}
          assignableRoles={access.canAssignRole ? assignableRoles : []}
          canRemoveRole={access.canRemoveRole}
          open
          onOpenChange={(open) => (open ? null : setDialog('none'))}
        />
      ) : null}

      <AlertDialog
        open={dialog === 'status'}
        onOpenChange={(open) => {
          if (!open && !statusMutation.isPending) {
            setDialog('none');
          }
        }}
      >
        <AlertDialogContent data-testid="member-status-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {member.isActive
                ? t('status.confirmDeactivateTitle')
                : t('status.confirmActivateTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {member.isActive
                ? t('status.confirmDeactivateText', { name: title })
                : t('status.confirmActivateText', { name: title })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusMutation.isPending}>
              {t('status.cancel')}
            </AlertDialogCancel>

            <Button
              type="button"
              data-testid="member-status-confirm"
              variant={member.isActive ? 'destructive' : 'default'}
              disabled={statusMutation.isPending}
              onClick={() =>
                void statusMutation
                  .mutateAsync(!member.isActive)
                  .then(() => setDialog('none'))
                  .catch(() => {
                    // El aviso de error ya lo muestra la mutación.
                  })
              }
            >
              {statusMutation.isPending ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : null}
              {member.isActive ? t('status.deactivate') : t('status.activate')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InfoCard(
  props: React.PropsWithChildren<{ title: string; description: string }>,
) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">{props.title}</CardTitle>
        <CardDescription className="text-xs">
          {props.description}
        </CardDescription>
      </CardHeader>
      <CardContent>{props.children}</CardContent>
    </Card>
  );
}
