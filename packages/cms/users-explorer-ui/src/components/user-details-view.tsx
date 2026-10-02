/**
 * Ficha de un usuario de Auth en el CMS (`/admin/cms/users/$id`).
 *
 * Muestra el estado de la cuenta, sus identidades, sus factores MFA y sus
 * metadatos (solo lectura: el CMS no permite editar `app_metadata`), y las
 * acciones que la API dice que están disponibles (`actions`):
 *
 *  - bloquear/desbloquear, restablecer contraseña y enviar enlace de acceso
 *    (`actions.canUpdate`), borrar (`actions.canDelete`) y quitar un factor
 *    MFA. Ninguna aparece sobre uno mismo, un super-admin de la plataforma
 *    ni personal del CMS con acceso (`actions.protection` explica por qué);
 *  - conceder o retirar el acceso al CMS (`canGrantAdminAccess`,
 *    `canRevokeAdminAccess`), que la API calcula con el permiso `account` y
 *    la jerarquía de rangos del RBAC del CMS.
 *
 * Todas las acciones se vuelven a autorizar en la API al ejecutarse.
 *
 * Si el usuario es personal del CMS y el lector puede ver la auditoría, se
 * enlaza su actividad en el registro (`/admin/cms/audit-logs?author=<id>`).
 */
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  BanIcon,
  ClipboardListIcon,
  LinkIcon,
  MailIcon,
  ShieldIcon,
  ShieldOffIcon,
  TrashIcon,
  UnlockIcon,
  UsersIcon,
} from 'lucide-react';
import { useTranslations } from 'use-intl';

import { useDateFormatter } from '@pymekit/cms-formatters/hooks';
import { useCmsAccount } from '@pymekit/cms-ui-core/account-context';
import type { CmsUserDetails } from '@pymekit/cms-ui-core/api';
import { useIsHydrated } from '@pymekit/cms-ui-core/hydration';
import { cmsQueryKeys } from '@pymekit/cms-ui-core/queries';
import { CMS_SECTION_PATHS } from '@pymekit/cms-ui-core/sections';
import { useEnumLabel } from '@pymekit/i18n/enum-labels';
import { Alert, AlertDescription } from '@pymekit/ui/alert';
import { Badge } from '@pymekit/ui/badge';
import { Button } from '@pymekit/ui/button';
import { CopyToClipboard } from '@pymekit/ui/copy-to-clipboard';

import {
  type UserAction,
  useRemoveMfaFactorMutation,
  useUserActionMutation,
} from '../hooks/use-user-mutations';
import { ConfirmUserActionDialog } from './confirm-user-action-dialog';
import { UserBadges } from './users-table-view';

export function UserDetailsView(props: { data: CmsUserDetails }) {
  const t = useTranslations('cms.usersExplorer');
  // Estado del factor MFA («verified», «unverified») en texto legible.
  const enumLabel = useEnumLabel();
  const hydrated = useIsHydrated();
  const formatDate = useDateFormatter();
  const { user, actions } = props.data;
  const canReadAuditLogs = useCmsAccount().access.auditLogs;

  const format = (value: string | null) =>
    value
      ? formatDate(new Date(value), 'dd MMM yyyy, HH:mm')
      : t('common.never');

  return (
    <div
      className="flex flex-col gap-6"
      data-testid="user-details"
      data-hydrated={hydrated}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex items-center gap-2 text-sm">
          <Link
            to={CMS_SECTION_PATHS.users}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            data-testid="user-details-back"
          >
            <UsersIcon className="h-3.5 w-3.5" />
            {t('title')}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium" data-testid="user-details-email">
            {user.email ?? user.id}
          </span>
        </nav>

        <UserActionsBar data={props.data} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{user.email ?? user.phone}</h1>
        <UserBadges user={user} />
        {/* Personal del CMS: su actividad en el registro de auditoría, solo
            si el lector puede verlo (la API filtra además por rango). */}
        {user.has_cms_access && canReadAuditLogs ? (
          <Link
            to={CMS_SECTION_PATHS.auditLogs}
            search={{ author: user.id }}
            className="text-primary flex items-center gap-1 text-xs underline-offset-4 hover:underline"
            data-testid="user-details-audit-logs"
          >
            <ClipboardListIcon className="h-3.5 w-3.5" />
            {t('details.auditLogs')}
          </Link>
        ) : null}
        {user.is_banned ? (
          <Badge variant="destructive" data-testid="user-banned-badge">
            {t('status.banned')}
          </Badge>
        ) : null}
      </div>

      {actions.protection ? (
        <Alert data-testid="user-protected-notice">
          <ShieldIcon className="h-4 w-4" />
          <AlertDescription>
            {t(`protection.${actions.protection}`)}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid max-w-4xl gap-8 md:grid-cols-2">
        <Section title={t('details.account')}>
          <InfoRow label={t('details.userId')}>
            <CopyToClipboard value={user.id} className="font-mono text-xs">
              {user.id}
            </CopyToClipboard>
          </InfoRow>
          <InfoRow label={t('details.emailConfirmed')}>
            {user.email_confirmed_at
              ? format(user.email_confirmed_at)
              : t('details.notConfirmed')}
          </InfoRow>
          <InfoRow label={t('details.createdAt')}>
            {format(user.created_at)}
          </InfoRow>
          <InfoRow label={t('details.lastSignIn')}>
            {format(user.last_sign_in_at)}
          </InfoRow>
          <InfoRow label={t('details.status')}>
            <span data-testid="user-status">
              {user.is_banned ? t('status.banned') : t('status.active')}
            </span>
          </InfoRow>
        </Section>

        <Section title={t('details.identities')}>
          {user.identities.length === 0 ? (
            <p className="text-muted-foreground py-2 text-sm">
              {t('details.noIdentities')}
            </p>
          ) : (
            user.identities.map((identity) => (
              <InfoRow key={identity.id} label={identity.provider}>
                {format(identity.last_sign_in_at)}
              </InfoRow>
            ))
          )}
        </Section>

        <Section title={t('details.mfaFactors')}>
          {user.mfa_factors.length === 0 ? (
            <p className="text-muted-foreground py-2 text-sm">
              {t('details.noMfaFactors')}
            </p>
          ) : (
            user.mfa_factors.map((factor) => (
              <InfoRow
                key={factor.id}
                label={`${factor.friendly_name ?? factor.factor_type} · ${enumLabel(factor.status)}`}
              >
                {actions.canUpdate ? (
                  <RemoveMfaFactorButton
                    userId={user.id}
                    factorId={factor.id}
                  />
                ) : (
                  format(factor.created_at)
                )}
              </InfoRow>
            ))
          )}
        </Section>
      </div>

      <div className="grid max-w-4xl gap-6 md:grid-cols-2">
        <Section title={t('details.appMetadata')}>
          <JsonBlock value={user.app_metadata} testId="user-app-metadata" />
        </Section>
        <Section title={t('details.userMetadata')}>
          <JsonBlock value={user.user_metadata} testId="user-user-metadata" />
        </Section>
      </div>
    </div>
  );
}

/** Barra de acciones de la ficha: solo las que la API marca como disponibles. */
function UserActionsBar(props: { data: CmsUserDetails }) {
  const t = useTranslations('cms.usersExplorer');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, actions } = props.data;

  const button = (action: UserAction, icon: React.ReactNode) => ({
    trigger: (
      <Button
        size="sm"
        variant={action === 'delete' ? 'destructive' : 'outline'}
        data-testid={`user-action-${action}`}
      />
    ),
    triggerContent: (
      <>
        {icon}
        {t(`actions.${action}.button`)}
      </>
    ),
  });

  return (
    <div className="flex flex-wrap gap-2" data-testid="user-actions">
      {actions.canUpdate ? (
        <>
          {user.is_banned ? (
            <UserActionDialog
              action="unban"
              userId={user.id}
              email={user.email}
              {...button('unban', <UnlockIcon className="h-3.5 w-3.5" />)}
            />
          ) : (
            <UserActionDialog
              action="ban"
              userId={user.id}
              email={user.email}
              confirmWord="BAN"
              {...button('ban', <BanIcon className="h-3.5 w-3.5" />)}
            />
          )}

          <UserActionDialog
            action="resetPassword"
            userId={user.id}
            email={user.email}
            {...button('resetPassword', <MailIcon className="h-3.5 w-3.5" />)}
          />

          <UserActionDialog
            action="magicLink"
            userId={user.id}
            email={user.email}
            {...button('magicLink', <LinkIcon className="h-3.5 w-3.5" />)}
          />
        </>
      ) : null}

      {actions.canGrantAdminAccess ? (
        <UserActionDialog
          action="grantAdminAccess"
          userId={user.id}
          email={user.email}
          {...button(
            'grantAdminAccess',
            <ShieldIcon className="h-3.5 w-3.5" />,
          )}
        />
      ) : null}

      {actions.canRevokeAdminAccess ? (
        <UserActionDialog
          action="revokeAdminAccess"
          userId={user.id}
          email={user.email}
          confirmWord="REVOKE"
          {...button(
            'revokeAdminAccess',
            <ShieldOffIcon className="h-3.5 w-3.5" />,
          )}
        />
      ) : null}

      {actions.canDelete ? (
        <UserActionDialog
          action="delete"
          userId={user.id}
          email={user.email}
          confirmWord="DELETE"
          onDone={async () => {
            await navigate({ href: CMS_SECTION_PATHS.users });
            queryClient.removeQueries({ queryKey: cmsQueryKeys.user(user.id) });
          }}
          {...button('delete', <TrashIcon className="h-3.5 w-3.5" />)}
        />
      ) : null}
    </div>
  );
}

function UserActionDialog(props: {
  action: UserAction;
  userId: string;
  email: string | null;
  confirmWord?: string;
  trigger: React.ReactElement;
  triggerContent: React.ReactNode;
  onDone?: () => Promise<void>;
}) {
  const t = useTranslations('cms.usersExplorer');
  const mutation = useUserActionMutation(props.action);

  return (
    <ConfirmUserActionDialog
      trigger={props.trigger}
      triggerContent={props.triggerContent}
      testId={`user-action-${props.action}`}
      destructive={
        props.action === 'delete' ||
        props.action === 'ban' ||
        props.action === 'revokeAdminAccess'
      }
      confirmWord={props.confirmWord}
      title={t(`actions.${props.action}.title`)}
      description={t(`actions.${props.action}.description`, {
        email: props.email ?? props.userId,
      })}
      confirmLabel={t(`actions.${props.action}.button`)}
      onConfirm={async () => {
        await mutation.mutateAsync(props.userId);
        await props.onDone?.();
      }}
    />
  );
}

function RemoveMfaFactorButton(props: { userId: string; factorId: string }) {
  const t = useTranslations('cms.usersExplorer');
  const mutation = useRemoveMfaFactorMutation();

  return (
    <ConfirmUserActionDialog
      trigger={
        <Button
          size="sm"
          variant="ghost"
          data-testid={`remove-mfa-factor-${props.factorId}`}
        />
      }
      triggerContent={<TrashIcon className="h-3.5 w-3.5" />}
      testId="remove-mfa-factor"
      destructive
      title={t('actions.removeMfaFactor.title')}
      description={t('actions.removeMfaFactor.description')}
      confirmLabel={t('actions.removeMfaFactor.button')}
      onConfirm={() => mutation.mutateAsync(props)}
    />
  );
}

function Section(props: React.PropsWithChildren<{ title: string }>) {
  return (
    <section>
      <h2 className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
        {props.title}
      </h2>
      <div className="divide-y">{props.children}</div>
    </section>
  );
}

function InfoRow(props: React.PropsWithChildren<{ label: string }>) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{props.label}</span>
      <span className="text-right">{props.children}</span>
    </div>
  );
}

/**
 * Metadatos en JSON. Se pintan como texto (React escapa el contenido), nunca
 * como HTML: son datos que el propio usuario puede controlar
 * (`user_metadata`).
 */
function JsonBlock(props: { value: unknown; testId: string }) {
  return (
    <pre
      data-testid={props.testId}
      className="bg-muted max-h-64 overflow-auto rounded-md p-3 text-xs"
    >
      {JSON.stringify(props.value ?? {}, null, 2)}
    </pre>
  );
}
