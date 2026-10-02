/**
 * Mutaciones de los paneles y sus *widgets* (F2.8).
 *
 * Siguen el patrón de TanStack Query de la web: `useMutation` sobre la
 * función del cliente RPC (`useCmsApi().api`), aviso (*toast*) de éxito o de
 * error con el mensaje del código estable de la API (`getDashboardErrorKey`)
 * y, al terminar bien, invalidación de todo lo de los paneles
 * (`cmsQueryKeys.dashboards()`: listado, ficha y datos de los *widgets*).
 *
 * [TFG] RF-11 · ADR-013.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import type {
  DashboardShareLevel,
  WidgetDefinition,
  WidgetPosition,
} from '@pymekit/cms-shared/dashboards';
import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { cmsQueryKeys } from '@pymekit/cms-ui-core/queries';
import { toast } from '@pymekit/ui/sonner';

import { getDashboardErrorKey } from '../utils/dashboard-errors';

/** Mutación con aviso de error e invalidación de la caché de paneles. */
function useDashboardMutation<TVariables, TResult>(options: {
  mutationFn: (variables: TVariables) => Promise<TResult>;
  successKey?: string;
  errorKey: string;
  /**
   * Qué se invalida (por defecto, todo lo de los paneles). Al borrar un
   * panel solo se invalidan los listados: volver a pedir su ficha, que
   * sigue en pantalla, respondería 404 antes de navegar al listado.
   */
  invalidateKey?: readonly unknown[];
}) {
  const t = useTranslations('cms.dashboards');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: options.mutationFn,
    onSuccess: async () => {
      if (options.successKey) {
        toast.success(t(options.successKey));
      }

      await queryClient.invalidateQueries({
        queryKey: options.invalidateKey ?? cmsQueryKeys.dashboards(),
      });
    },
    onError: (error) =>
      toast.error(t(getDashboardErrorKey(error, options.errorKey))),
  });
}

export function useCreateDashboardMutation() {
  const { api } = useCmsApi();

  return useDashboardMutation({
    mutationFn: (name: string) => api.createDashboard({ name }),
    successKey: 'messages.created',
    errorKey: 'errors.createFailed',
  });
}

export function useRenameDashboardMutation() {
  const { api } = useCmsApi();

  return useDashboardMutation({
    mutationFn: (params: { id: string; name: string }) =>
      api.renameDashboard(params),
    successKey: 'messages.renamed',
    errorKey: 'errors.saveFailed',
  });
}

export function useDeleteDashboardMutation() {
  const { api } = useCmsApi();

  return useDashboardMutation({
    mutationFn: (id: string) => api.deleteDashboard(id),
    successKey: 'messages.deleted',
    errorKey: 'errors.deleteFailed',
    invalidateKey: [...cmsQueryKeys.dashboards(), 'list'],
  });
}

export function useShareDashboardMutation() {
  const { api } = useCmsApi();

  return useDashboardMutation({
    mutationFn: (params: {
      id: string;
      roleId: string;
      permissionLevel: DashboardShareLevel;
    }) => api.shareDashboard(params),
    successKey: 'messages.shared',
    errorKey: 'errors.saveFailed',
  });
}

export function useUnshareDashboardMutation() {
  const { api } = useCmsApi();

  return useDashboardMutation({
    mutationFn: (params: { id: string; roleId: string }) =>
      api.unshareDashboard(params),
    successKey: 'messages.unshared',
    errorKey: 'errors.saveFailed',
  });
}

export function useCreateWidgetMutation() {
  const { api } = useCmsApi();

  return useDashboardMutation({
    mutationFn: (
      data: WidgetDefinition & {
        dashboardId: string;
        position?: WidgetPosition;
      },
    ) => api.createWidget(data),
    successKey: 'messages.widgetSaved',
    errorKey: 'errors.saveFailed',
  });
}

export function useUpdateWidgetMutation() {
  const { api } = useCmsApi();

  return useDashboardMutation({
    mutationFn: (params: { id: string; definition: WidgetDefinition }) =>
      api.updateWidget(params),
    successKey: 'messages.widgetSaved',
    errorKey: 'errors.saveFailed',
  });
}

export function useDeleteWidgetMutation() {
  const { api } = useCmsApi();

  return useDashboardMutation({
    mutationFn: (id: string) => api.deleteWidget(id),
    successKey: 'messages.widgetDeleted',
    errorKey: 'errors.deleteFailed',
  });
}

export function useUpdateWidgetPositionsMutation() {
  const { api } = useCmsApi();

  return useDashboardMutation({
    mutationFn: (data: {
      dashboardId: string;
      updates: Array<{ id: string; position: WidgetPosition }>;
    }) => api.updateWidgetPositions(data),
    successKey: 'messages.layoutSaved',
    errorKey: 'errors.saveFailed',
  });
}
