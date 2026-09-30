/**
 * Mutaciones del explorador de usuarios del CMS.
 *
 * Todas siguen el patrón de TanStack Query de la web: `useMutation` sobre la
 * función del cliente RPC (`useCmsApi().api`), aviso (*toast*) de éxito o de
 * error con el mensaje del código estable de la API (`getUserErrorKey`) y,
 * al terminar bien, invalidación de todo el explorador de usuarios
 * (`cmsQueryKeys.users()`): el listado y la ficha se vuelven a pedir.
 *
 * Borrar un usuario no invalida su ficha (daría 404 mientras sigue en
 * pantalla): quien llama navega fuera y la quita de la caché.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { cmsQueryKeys } from '@pymekit/cms-ui-core/queries';
import type { UsersBatchAction } from '@pymekit/cms-ui-core/users-api';
import { toast } from '@pymekit/ui/sonner';

import { getUserErrorKey } from '../utils/user-errors';

/** Acciones sobre un único usuario desde su ficha. */
export type UserAction =
  | 'ban'
  | 'unban'
  | 'resetPassword'
  | 'magicLink'
  | 'grantAdminAccess'
  | 'revokeAdminAccess'
  | 'delete';

function useUsersFeedback() {
  const t = useTranslations('cms.usersExplorer');
  const queryClient = useQueryClient();

  return {
    t,
    showError: (error: unknown, fallback: string) =>
      toast.error(t(getUserErrorKey(error, fallback))),
    invalidateUsers: (exceptUserId?: string) =>
      queryClient.invalidateQueries({
        queryKey: cmsQueryKeys.users(),
        predicate: exceptUserId
          ? (query) =>
              JSON.stringify(query.queryKey) !==
              JSON.stringify(cmsQueryKeys.user(exceptUserId))
          : undefined,
      }),
  };
}

/** Ejecuta una acción sobre un usuario desde su ficha. */
export function useUserActionMutation(action: UserAction) {
  const { api } = useCmsApi();
  const { t, showError, invalidateUsers } = useUsersFeedback();

  return useMutation({
    mutationFn: (userId: string) => {
      switch (action) {
        case 'ban':
          return api.banUser(userId);
        case 'unban':
          return api.unbanUser(userId);
        case 'resetPassword':
          return api.resetUserPassword(userId);
        case 'magicLink':
          return api.sendUserMagicLink(userId, 'recovery');
        case 'grantAdminAccess':
          return api.updateUserAdminAccess(userId, true);
        case 'revokeAdminAccess':
          return api.updateUserAdminAccess(userId, false);
        case 'delete':
          return api.deleteUser(userId);
      }
    },
    onSuccess: async (_, userId) => {
      toast.success(t(`actions.${action}.success`));
      await invalidateUsers(action === 'delete' ? userId : undefined);
    },
    onError: (error) => showError(error, `actions.${action}.error`),
  });
}

/** Quita un factor MFA de un usuario. */
export function useRemoveMfaFactorMutation() {
  const { api } = useCmsApi();
  const { t, showError, invalidateUsers } = useUsersFeedback();

  return useMutation({
    mutationFn: (params: { userId: string; factorId: string }) =>
      api.removeUserMfaFactor(params.userId, params.factorId),
    onSuccess: async () => {
      toast.success(t('actions.removeMfaFactor.success'));
      await invalidateUsers();
    },
    onError: (error) => showError(error, 'actions.removeMfaFactor.error'),
  });
}

/** Crea un usuario con correo y contraseña. */
export function useCreateUserMutation() {
  const { api } = useCmsApi();
  const { t, showError, invalidateUsers } = useUsersFeedback();

  return useMutation({
    mutationFn: (data: {
      email: string;
      password: string;
      autoConfirm: boolean;
    }) => api.createUser(data),
    onSuccess: async () => {
      toast.success(t('create.success'));
      await invalidateUsers();
    },
    onError: (error) => showError(error, 'create.error'),
  });
}

/** Invita a un usuario por correo. */
export function useInviteUserMutation() {
  const { api } = useCmsApi();
  const { t, showError, invalidateUsers } = useUsersFeedback();

  return useMutation({
    mutationFn: (email: string) => api.inviteUser(email),
    onSuccess: async () => {
      toast.success(t('invite.success'));
      await invalidateUsers();
    },
    onError: (error) => showError(error, 'invite.error'),
  });
}

/**
 * Aplica una acción a varios usuarios. Avisa del resultado parcial si alguno
 * falla (por ejemplo, porque otro operador le dio acceso al CMS entretanto).
 */
export function useBatchUsersMutation(action: UsersBatchAction) {
  const { api } = useCmsApi();
  const { t, showError, invalidateUsers } = useUsersFeedback();

  return useMutation({
    mutationFn: (userIds: string[]) => api.batchUsersAction(action, userIds),
    onSuccess: async (result) => {
      if (result.failed > 0) {
        toast.warning(
          t('batch.partial', {
            processed: result.processed,
            failed: result.failed,
          }),
        );
      } else {
        toast.success(t('batch.success', { count: result.processed }));
      }

      await invalidateUsers();
    },
    onError: (error) => showError(error, 'batch.error'),
  });
}
