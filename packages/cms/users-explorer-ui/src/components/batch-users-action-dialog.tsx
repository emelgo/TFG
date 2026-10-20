/**
 * Confirmación de una acción sobre varios usuarios (bloquear, desbloquear,
 * restablecer contraseña o borrar).
 *
 * Recibe solo los usuarios a los que se aplica (`getBatchActionTargets`) y
 * los lista para que el operador vea exactamente a quién afecta. Borrar exige
 * escribir `ELIMINAR`. La API procesa cada usuario por separado y devuelve
 * cuántos fallaron; la mutación avisa del resultado parcial.
 */
import { useTranslations } from 'use-intl';

import type { CmsUserListItem } from '@pymekit/cms-ui-core/api';
import type { UsersBatchAction } from '@pymekit/cms-ui-core/users-api';

import { useBatchUsersMutation } from '../hooks/use-user-mutations';
import { ConfirmUserActionDialog } from './confirm-user-action-dialog';

export function BatchUsersActionDialog(props: {
  action: UsersBatchAction;
  users: CmsUserListItem[];
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const t = useTranslations('cms.usersExplorer');
  const mutation = useBatchUsersMutation(props.action);

  return (
    <ConfirmUserActionDialog
      open
      onOpenChange={props.onOpenChange}
      testId={`users-batch-${props.action}`}
      destructive={props.action === 'delete' || props.action === 'ban'}
      confirmWord={props.action === 'delete' ? 'ELIMINAR' : undefined}
      title={t(`batch.dialogs.${props.action}.title`, {
        count: props.users.length,
      })}
      description={
        <span className="flex flex-col gap-2">
          <span>{t(`batch.dialogs.${props.action}.description`)}</span>
          <span className="max-h-32 overflow-y-auto font-mono text-xs">
            {props.users.map((user) => (
              <span key={user.id} className="block">
                {user.email ?? user.id}
              </span>
            ))}
          </span>
        </span>
      }
      confirmLabel={t(`batch.actions.${props.action}`)}
      onConfirm={async () => {
        await mutation.mutateAsync(props.users.map((user) => user.id));
        props.onDone();
      }}
    />
  );
}
