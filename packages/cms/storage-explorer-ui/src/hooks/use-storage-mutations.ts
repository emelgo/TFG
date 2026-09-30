/**
 * Mutaciones del explorador de almacenamiento del CMS: subir, crear carpeta,
 * renombrar, borrar y descargar.
 *
 * Mismo patrón que el resto del CMS: `useMutation` sobre el cliente RPC
 * (`useCmsApi().api`), aviso con el mensaje del código estable de la API
 * (`getStorageErrorKey`) e invalidación de todo el almacenamiento
 * (`cmsQueryKeys.storage()`) al terminar bien.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { cmsQueryKeys } from '@pymekit/cms-ui-core/queries';
import { toast } from '@pymekit/ui/sonner';

import { getStorageErrorKey } from '../utils/storage-errors';

function useStorageFeedback() {
  const t = useTranslations('cms.storageExplorer');
  const queryClient = useQueryClient();

  return {
    t,
    showError: (error: unknown, fallback: string) =>
      toast.error(t(getStorageErrorKey(error, fallback))),
    invalidate: () =>
      queryClient.invalidateQueries({ queryKey: cmsQueryKeys.storage() }),
  };
}

/**
 * Sube uno o varios ficheros a una carpeta, de uno en uno (cada petición
 * lleva un solo fichero, dentro del límite de tamaño de la API). Si alguno
 * falla, se avisa con su motivo y se sigue con el resto.
 */
export function useUploadFilesMutation() {
  const { api } = useCmsApi();
  const { t, showError, invalidate } = useStorageFeedback();

  return useMutation({
    mutationFn: async (params: {
      bucket: string;
      folder: string;
      files: File[];
    }) => {
      let uploaded = 0;

      for (const file of params.files) {
        try {
          await api.uploadStorageFile({
            bucket: params.bucket,
            folder: params.folder,
            file,
          });

          uploaded += 1;
        } catch (error) {
          showError(error, 'upload.error');
        }
      }

      return { uploaded, total: params.files.length };
    },
    onSuccess: async ({ uploaded }) => {
      if (uploaded > 0) {
        toast.success(t('upload.success', { count: uploaded }));
      }

      await invalidate();
    },
  });
}

/** Crea una carpeta dentro de la carpeta actual. */
export function useCreateFolderMutation() {
  const { api } = useCmsApi();
  const { t, showError, invalidate } = useStorageFeedback();

  return useMutation({
    mutationFn: (params: {
      bucket: string;
      parentPath: string;
      folderName: string;
    }) => api.createStorageFolder(params),
    onSuccess: async () => {
      toast.success(t('createFolder.success'));
      await invalidate();
    },
    onError: (error) => showError(error, 'createFolder.error'),
  });
}

/** Renombra un fichero (lo mueve a otro nombre en la misma carpeta). */
export function useRenameFileMutation() {
  const { api } = useCmsApi();
  const { t, showError, invalidate } = useStorageFeedback();

  return useMutation({
    mutationFn: (params: {
      bucket: string;
      fromPath: string;
      toPath: string;
    }) => api.renameStorageFile(params),
    onSuccess: async () => {
      toast.success(t('rename.success'));
      await invalidate();
    },
    onError: (error) => showError(error, 'rename.error'),
  });
}

/** Borra ficheros y carpetas (con todo su contenido). */
export function useDeleteFilesMutation() {
  const { api } = useCmsApi();
  const { t, showError, invalidate } = useStorageFeedback();

  return useMutation({
    mutationFn: (params: { bucket: string; paths: string[] }) =>
      api.deleteStorageFiles(params),
    onSuccess: async (result) => {
      toast.success(t('delete.success', { count: result.deleted }));
      await invalidate();
    },
    onError: (error) => showError(error, 'delete.error'),
  });
}

/**
 * Descarga un fichero: pide una URL firmada de un minuto que fuerza la
 * descarga (`Content-Disposition: attachment`) y la abre. Nunca se navega a
 * la URL del objeto sin ese parámetro, así que un HTML o SVG subido no se
 * ejecuta.
 */
export function useDownloadFileMutation() {
  const { api } = useCmsApi();
  const { showError } = useStorageFeedback();

  return useMutation({
    mutationFn: (params: { bucket: string; path: string }) =>
      api.getStorageDownloadUrl(params),
    onSuccess: ({ downloadUrl }) => {
      const link = document.createElement('a');

      link.href = downloadUrl;
      link.rel = 'noopener noreferrer';
      link.click();
    },
    onError: (error) => showError(error, 'download.error'),
  });
}
