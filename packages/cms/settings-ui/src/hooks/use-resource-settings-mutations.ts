/**
 * Mutaciones de Ajustes > Recursos (F2.7c).
 *
 * Mismo patrón que el resto de Ajustes: `useMutation` sobre la API del
 * cliente RPC, aviso de éxito o de error con el mensaje del código estable
 * (`getSettingsErrorKey`) e invalidación al terminar. Se invalidan a la vez
 * Ajustes > Recursos, el metadato del explorador (`cmsQueryKeys.tables()`)
 * y la navegación (`navigation()`), porque los tres leen
 * `cms.table_metadata`: un cambio de etiqueta o de visibilidad se ve al
 * momento en el listado, la ficha y la barra lateral.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { cmsQueryKeys } from '@pymekit/cms-ui-core/queries';
import type {
  ColumnsConfigInput,
  RecordLayoutInput,
  RelationsConfigInput,
  ResourceRef,
  TableMetadataInput,
  TablesMetadataInput,
} from '@pymekit/cms-ui-core/resource-settings-api';
import { toast } from '@pymekit/ui/sonner';

import { getSettingsErrorKey } from '../utils/settings-errors';

function useResourceMutation<TInput>(
  mutationFn: (input: TInput) => Promise<unknown>,
  messages: { success: string; error: string },
) {
  const queryClient = useQueryClient();
  const t = useTranslations('cms.settings');

  return useMutation({
    mutationFn,
    onSuccess: async () => {
      toast.success(t(messages.success));

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: cmsQueryKeys.resourceSettings(),
        }),
        queryClient.invalidateQueries({ queryKey: cmsQueryKeys.tables() }),
        queryClient.invalidateQueries({
          queryKey: cmsQueryKeys.navigation(),
        }),
      ]);
    },
    onError: (error) =>
      toast.error(t(getSettingsErrorKey(error, messages.error))),
  });
}

/** Visibilidad y orden de varias tablas. */
export function useUpdateTablesMetadataMutation() {
  const { api } = useCmsApi();

  return useResourceMutation(
    (data: TablesMetadataInput) => api.updateTablesMetadata(data),
    { success: 'resources.saved', error: 'resources.saveError' },
  );
}

/** Metadato propio de una tabla. */
export function useUpdateTableMetadataMutation(ref: ResourceRef) {
  const { api } = useCmsApi();

  return useResourceMutation(
    (data: TableMetadataInput) => api.updateTableMetadata(ref, data),
    { success: 'resources.saved', error: 'resources.saveError' },
  );
}

/** Presentación de columnas. */
export function useUpdateColumnsConfigMutation(ref: ResourceRef) {
  const { api } = useCmsApi();

  return useResourceMutation(
    (data: ColumnsConfigInput) => api.updateColumnsConfig(ref, data),
    { success: 'resources.saved', error: 'resources.saveError' },
  );
}

/** Secciones de relaciones de la ficha. */
export function useUpdateRelationsConfigMutation(ref: ResourceRef) {
  const { api } = useCmsApi();

  return useResourceMutation(
    (updates: RelationsConfigInput) => api.updateRelationsConfig(ref, updates),
    { success: 'resources.saved', error: 'resources.saveError' },
  );
}

/** Distribución de la ficha (`null` vuelve a la de por defecto). */
export function useSaveRecordLayoutMutation(ref: ResourceRef) {
  const { api } = useCmsApi();

  return useResourceMutation(
    (layout: RecordLayoutInput) => api.saveRecordLayout(ref, layout),
    { success: 'resources.layout.saved', error: 'resources.saveError' },
  );
}

/** Sincronización con el catálogo de PostgreSQL. */
export function useSyncManagedTablesMutation() {
  const { api } = useCmsApi();

  return useResourceMutation(
    (data: { schema: string; table?: string }) => api.syncManagedTables(data),
    { success: 'resources.sync.done', error: 'resources.sync.error' },
  );
}
