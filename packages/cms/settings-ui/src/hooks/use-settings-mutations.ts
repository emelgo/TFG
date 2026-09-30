/**
 * Mutaciones de Ajustes del CMS (F2.7a).
 *
 * Siguen el patrón de TanStack Query de la web: `useMutation` sobre la
 * función del cliente RPC (`useCmsApi().api`), aviso (*toast*) de éxito o de
 * error con el mensaje del código estable de la API (`getSettingsErrorKey`)
 * y, al terminar bien, invalidación de lo que ha cambiado:
 *
 *  - preferencias → la cuenta (`cmsQueryKeys.account()`): el *layout* del
 *    CMS la vuelve a leer y `FormatterPreferencesProvider` aplica la zona
 *    horaria nueva a todas las fechas;
 *  - MFA → su configuración;
 *  - miembros → el listado y las fichas (`cmsQueryKeys.members()`) y el
 *    registro de auditoría, que acaba de ganar una entrada.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { cmsQueryKeys } from '@pymekit/cms-ui-core/queries';
import type { MemberRolesChange } from '@pymekit/cms-ui-core/settings-api';
import { toast } from '@pymekit/ui/sonner';

import { getSettingsErrorKey } from '../utils/settings-errors';

function useSettingsFeedback() {
  const t = useTranslations('cms.settings');

  return {
    t,
    showError: (error: unknown, fallback: string) =>
      toast.error(t(getSettingsErrorKey(error, fallback))),
  };
}

/** Guarda las preferencias personales (idioma y zona horaria). */
export function useUpdatePreferencesMutation() {
  const { api } = useCmsApi();
  const queryClient = useQueryClient();
  const { t, showError } = useSettingsFeedback();

  return useMutation({
    mutationFn: (data: { language?: string; timezone?: string }) =>
      api.updatePreferences(data),
    onSuccess: async () => {
      toast.success(t('general.saved'));
      await queryClient.invalidateQueries({
        queryKey: cmsQueryKeys.account(),
      });
    },
    onError: (error) => showError(error, 'general.saveError'),
  });
}

/** Activa o desactiva la obligación de MFA para todo el personal. */
export function useUpdateMfaConfigurationMutation() {
  const { api } = useCmsApi();
  const queryClient = useQueryClient();
  const { t, showError } = useSettingsFeedback();

  return useMutation({
    mutationFn: (requiresMfa: boolean) =>
      api.updateMfaConfiguration(requiresMfa),
    onSuccess: async (_, requiresMfa) => {
      toast.success(
        t(requiresMfa ? 'authentication.enabled' : 'authentication.disabled'),
      );
      await queryClient.invalidateQueries({
        queryKey: cmsQueryKeys.mfaConfiguration(),
      });
    },
    onError: (error) => showError(error, 'authentication.saveError'),
  });
}

function useInvalidateMembers() {
  const queryClient = useQueryClient();

  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: cmsQueryKeys.members() }),
      queryClient.invalidateQueries({ queryKey: cmsQueryKeys.auditLogs() }),
    ]);
}

/** Cambia el rol de un miembro. */
export function useMemberRolesMutation(memberId: string) {
  const { api } = useCmsApi();
  const invalidateMembers = useInvalidateMembers();
  const { t, showError } = useSettingsFeedback();

  return useMutation({
    mutationFn: (change: MemberRolesChange) =>
      api.updateMemberRoles(memberId, change),
    onSuccess: async () => {
      toast.success(t('members.role.saved'));
      await invalidateMembers();
    },
    // También al fallar: si otro operador cambió el miembro entretanto, la
    // ficha se actualiza y el siguiente intento parte del estado real.
    onError: async (error) => {
      showError(error, 'members.role.saveError');
      await invalidateMembers();
    },
  });
}

/** Activa o desactiva la cuenta del CMS de un miembro. */
export function useMemberStatusMutation(memberId: string) {
  const { api } = useCmsApi();
  const invalidateMembers = useInvalidateMembers();
  const { t, showError } = useSettingsFeedback();

  return useMutation({
    mutationFn: (active: boolean) => api.setMemberActive(memberId, active),
    onSuccess: async (_, active) => {
      toast.success(
        t(active ? 'members.status.activated' : 'members.status.deactivated'),
      );
      await invalidateMembers();
    },
    onError: async (error) => {
      showError(error, 'members.status.saveError');
      await invalidateMembers();
    },
  });
}
