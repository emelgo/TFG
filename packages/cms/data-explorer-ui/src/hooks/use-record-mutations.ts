/**
 * Mutaciones de registros del explorador de datos (crear, editar, borrar,
 * borrado múltiple, vincular y desvincular).
 *
 * Todas siguen el mismo patrón de TanStack Query: `useMutation` sobre la
 * función del cliente RPC (`useCmsApi().api`), aviso (*toast*) de éxito o de
 * error y, al terminar bien, invalidación de **todas** las consultas de
 * tablas (`cmsQueryKeys.tables()`): una escritura puede cambiar el listado,
 * la ficha y las secciones relacionadas de otras tablas (un borrado en
 * cascada, un registro hijo nuevo). Solo se vuelven a pedir las consultas que
 * están en pantalla.
 *
 * El mensaje de error sale del código estable de la API
 * (`getWriteErrorKey`), nunca del texto de la base de datos. La navegación
 * posterior (ir a la ficha, volver al listado) la decide quien llama, en su
 * propio `onSuccess`.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import type { M2MLinkParams, RecordParams } from '@pymekit/cms-ui-core/api';
import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { cmsQueryKeys } from '@pymekit/cms-ui-core/queries';
import { toast } from '@pymekit/ui/sonner';

import { getWriteErrorKey } from '../utils/write-errors';

/** Invalida las consultas de todas las tablas tras una escritura. */
function useInvalidateTables() {
  const queryClient = useQueryClient();

  return () =>
    queryClient.invalidateQueries({ queryKey: cmsQueryKeys.tables() });
}

/** Muestra el error de una escritura con el mensaje de su código. */
function useWriteErrorToast() {
  const t = useTranslations('cms.dataExplorer');

  return (error: unknown, fallback: string) =>
    toast.error(t(getWriteErrorKey(error, fallback)));
}

/** Crea un registro y devuelve la fila creada. */
export function useInsertRecordMutation() {
  const t = useTranslations('cms.dataExplorer');
  const { api } = useCmsApi();
  const invalidate = useInvalidateTables();
  const showError = useWriteErrorToast();

  return useMutation({
    mutationFn: (params: {
      schema: string;
      table: string;
      data: Record<string, unknown>;
    }) => api.insertRecord(params),
    onSuccess: async () => {
      toast.success(t('record.toasts.created'));
      await invalidate();
    },
    onError: (error) => showError(error, 'record.toasts.createFailed'),
  });
}

/** Actualiza un registro identificado por su clave. */
export function useUpdateRecordMutation() {
  const t = useTranslations('cms.dataExplorer');
  const { api } = useCmsApi();
  const invalidate = useInvalidateTables();
  const showError = useWriteErrorToast();

  return useMutation({
    mutationFn: (params: RecordParams & { data: Record<string, unknown> }) =>
      api.updateRecord(params),
    onSuccess: async () => {
      toast.success(t('record.toasts.updated'));
      await invalidate();
    },
    onError: (error) => showError(error, 'record.toasts.updateFailed'),
  });
}

/** Borra un registro identificado por su clave. */
export function useDeleteRecordMutation() {
  const t = useTranslations('cms.dataExplorer');
  const { api } = useCmsApi();
  const queryClient = useQueryClient();
  const showError = useWriteErrorToast();

  return useMutation({
    mutationFn: (
      params: RecordParams & {
        /** Claves con las que se cargó la ficha (su entrada de caché). */
        cacheKeys?: Record<string, string>;
      },
    ) =>
      api.deleteRecord({
        schema: params.schema,
        table: params.table,
        keys: params.keys,
      }),
    onSuccess: async (_, params) => {
      toast.success(t('record.toasts.deleted'));

      // La ficha borrada ya no existe: no se invalida (si sigue en pantalla
      // se volvería a pedir y daría 404 antes de salir de ella). Quien llama
      // navega fuera y la quita de la caché (`removeQueries`).
      const deletedKey = JSON.stringify(
        cmsQueryKeys.record({
          ...params,
          keys: params.cacheKeys ?? params.keys,
        }),
      );

      await queryClient.invalidateQueries({
        queryKey: cmsQueryKeys.tables(),
        predicate: (query) => JSON.stringify(query.queryKey) !== deletedKey,
      });
    },
    onError: (error) => showError(error, 'record.toasts.deleteFailed'),
  });
}

/**
 * Borra varios registros. La API responde 200 aunque alguno falle (por
 * ejemplo, porque otros registros apuntan a él): se avisa del resultado
 * parcial con el número de borrados y de fallidos.
 */
export function useBatchDeleteRecordsMutation() {
  const t = useTranslations('cms.dataExplorer');
  const { api } = useCmsApi();
  const invalidate = useInvalidateTables();
  const showError = useWriteErrorToast();

  return useMutation({
    mutationFn: (params: {
      schema: string;
      table: string;
      items: Array<Record<string, unknown>>;
    }) => api.batchDeleteRecords(params),
    onSuccess: async (result) => {
      const { successCount, failureCount } = result.data;

      if (failureCount > 0) {
        toast.warning(
          t('record.toasts.batchPartiallyDeleted', {
            successCount,
            failureCount,
          }),
        );
      } else {
        toast.success(t('record.toasts.batchDeleted', { count: successCount }));
      }

      await invalidate();
    },
    onError: (error) => showError(error, 'record.toasts.batchDeleteFailed'),
  });
}

/** Vincula dos registros de una relación muchos a muchos. */
export function useLinkRecordsMutation() {
  const t = useTranslations('cms.dataExplorer');
  const { api } = useCmsApi();
  const invalidate = useInvalidateTables();
  const showError = useWriteErrorToast();

  return useMutation({
    mutationFn: (params: M2MLinkParams) => api.linkRecords(params),
    onSuccess: async () => {
      toast.success(t('record.toasts.linked'));
      await invalidate();
    },
    onError: (error) => showError(error, 'record.toasts.linkFailed'),
  });
}

/** Desvincula dos registros de una relación muchos a muchos. */
export function useUnlinkRecordsMutation() {
  const t = useTranslations('cms.dataExplorer');
  const { api } = useCmsApi();
  const invalidate = useInvalidateTables();
  const showError = useWriteErrorToast();

  return useMutation({
    mutationFn: (params: M2MLinkParams) => api.unlinkRecords(params),
    onSuccess: async () => {
      toast.success(t('record.toasts.unlinked'));
      await invalidate();
    },
    onError: (error) => showError(error, 'record.toasts.unlinkFailed'),
  });
}
