/**
 * Mutaciones de Ajustes > Permisos (F2.7b).
 *
 * Mismo patrón que el resto de Ajustes: `useMutation` sobre la función del
 * cliente RPC (`useCmsApi().api`), aviso (*toast*) de éxito o de error con
 * el mensaje del código estable de la API (`getRbacErrorKey`) e
 * invalidación de lo que ha cambiado. Cualquier cambio del RBAC invalida
 * todo `cmsQueryKeys.rbac()` (resumen y fichas: una asignación cambia a la
 * vez varias de ellas y lo que el usuario puede hacer con cada una), los
 * miembros (que muestran el nombre del rol), los roles para compartir y el
 * registro de auditoría, que acaba de ganar una entrada. También se
 * invalida al fallar: si otro operador cambió algo entretanto, la pantalla
 * se actualiza y el siguiente intento parte del estado real.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import type {
  RbacAssignmentChanges,
  RbacGroupInput,
  RbacPermissionInput,
  RbacRoleInput,
} from '@pymekit/cms-ui-core/permissions-api';
import { cmsQueryKeys } from '@pymekit/cms-ui-core/queries';
import { toast } from '@pymekit/ui/sonner';

import { getRbacErrorKey } from '../utils/rbac-forms';

function useRbacMutation<TVariables, TData>(params: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  successKey: string;
}) {
  const queryClient = useQueryClient();
  const t = useTranslations('cms.settings.permissions');

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: cmsQueryKeys.rbac() }),
      queryClient.invalidateQueries({ queryKey: cmsQueryKeys.members() }),
      queryClient.invalidateQueries({
        queryKey: cmsQueryKeys.rolesForSharing(),
      }),
      queryClient.invalidateQueries({ queryKey: cmsQueryKeys.auditLogs() }),
    ]);

  return useMutation({
    mutationFn: params.mutationFn,
    onSuccess: async () => {
      toast.success(t(params.successKey));
      await invalidate();
    },
    onError: async (error) => {
      toast.error(t(getRbacErrorKey(error)));
      await invalidate();
    },
  });
}

export function useCreateRoleMutation() {
  const { api } = useCmsApi();

  return useRbacMutation({
    mutationFn: (input: RbacRoleInput) => api.createRbacRole(input),
    successKey: 'roles.created',
  });
}

export function useUpdateRoleMutation(id: string) {
  const { api } = useCmsApi();

  return useRbacMutation({
    mutationFn: (input: Partial<RbacRoleInput>) =>
      api.updateRbacRole(id, input),
    successKey: 'roles.updated',
  });
}

export function useDeleteRoleMutation(id: string) {
  const { api } = useCmsApi();

  return useRbacMutation({
    mutationFn: () => api.deleteRbacRole(id),
    successKey: 'roles.deleted',
  });
}

export function useRoleGroupsMutation(id: string) {
  const { api } = useCmsApi();

  return useRbacMutation({
    mutationFn: (changes: RbacAssignmentChanges) =>
      api.updateRbacRoleGroups(id, changes),
    successKey: 'assignments.saved',
  });
}

export function useRolePermissionsMutation(id: string) {
  const { api } = useCmsApi();

  return useRbacMutation({
    mutationFn: (changes: RbacAssignmentChanges) =>
      api.updateRbacRolePermissions(id, changes),
    successKey: 'assignments.saved',
  });
}

export function useCreateGroupMutation() {
  const { api } = useCmsApi();

  return useRbacMutation({
    mutationFn: (input: RbacGroupInput) => api.createRbacGroup(input),
    successKey: 'groups.created',
  });
}

export function useUpdateGroupMutation(id: string) {
  const { api } = useCmsApi();

  return useRbacMutation({
    mutationFn: (input: Partial<RbacGroupInput>) =>
      api.updateRbacGroup(id, input),
    successKey: 'groups.updated',
  });
}

export function useDeleteGroupMutation(id: string) {
  const { api } = useCmsApi();

  return useRbacMutation({
    mutationFn: () => api.deleteRbacGroup(id),
    successKey: 'groups.deleted',
  });
}

export function useGroupPermissionsMutation(id: string) {
  const { api } = useCmsApi();

  return useRbacMutation({
    mutationFn: (changes: RbacAssignmentChanges) =>
      api.updateRbacGroupPermissions(id, changes),
    successKey: 'assignments.saved',
  });
}

export function useCreatePermissionMutation() {
  const { api } = useCmsApi();

  return useRbacMutation({
    mutationFn: (input: RbacPermissionInput) => api.createRbacPermission(input),
    successKey: 'permission.created',
  });
}

export function useUpdatePermissionMutation(id: string) {
  const { api } = useCmsApi();

  return useRbacMutation({
    mutationFn: (input: RbacPermissionInput) =>
      api.updateRbacPermission(id, input),
    successKey: 'permission.updated',
  });
}

export function useDeletePermissionMutation(id: string) {
  const { api } = useCmsApi();

  return useRbacMutation({
    mutationFn: () => api.deleteRbacPermission(id),
    successKey: 'permission.deleted',
  });
}
