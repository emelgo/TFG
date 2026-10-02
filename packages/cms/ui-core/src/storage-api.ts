/**
 * Llamadas de la interfaz del CMS al explorador de almacenamiento (lado
 * cliente).
 *
 * Usan el cliente RPC tipado de Hono (tipos de las rutas con `import type`).
 * La subida de ficheros viaja como `multipart/form-data` a la API del CMS,
 * que valida el tamaño, la ruta y el permiso y decide el tipo de contenido;
 * el navegador nunca sube directamente a Supabase Storage.
 *
 * [TFG] RF-09 · ADR-011.
 */
import {
  createHonoClient,
  handleHonoClientResponse,
} from '@pymekit/cms-api/client';
import type {
  CreateFolderRoute,
  DeleteFileRoute,
  DownloadFileRoute,
  GetBucketContentsRoute,
  GetStorageBucketsRoute,
  RenameFileRoute,
  UploadFileRoute,
} from '@pymekit/cms-storage-explorer/routes';

type ClientOptions = { fetch?: typeof fetch };

/** Carpeta de un *bucket* que se quiere listar. */
export type BucketContentsParams = {
  bucket: string;
  /** Carpeta dentro del *bucket* (`''` para la raíz). */
  path: string;
  search?: string;
  page?: number;
};

/** Crea las funciones de acceso al explorador de almacenamiento. */
export function createStorageApi(clientOptions: ClientOptions) {
  return {
    /** *Buckets* cuya raíz puede leer el usuario. */
    async getStorageBuckets() {
      const client = createHonoClient<GetStorageBucketsRoute>(clientOptions);

      return handleHonoClientResponse(await client.v1.storage.buckets.$get());
    },

    /**
     * Una página del contenido de una carpeta, con los permisos de cada
     * elemento. Lanza `ApiError` 403 sin permiso y 400 con una ruta no válida.
     */
    async getBucketContents(params: BucketContentsParams) {
      const client = createHonoClient<GetBucketContentsRoute>(clientOptions);

      const response = await client.v1.storage.buckets[':bucket'].contents.$get(
        {
          param: { bucket: params.bucket },
          query: {
            ...(params.path ? { path: params.path } : {}),
            ...(params.search ? { search: params.search } : {}),
            ...(params.page && params.page > 1
              ? { page: String(params.page) }
              : {}),
          },
        },
      );

      return handleHonoClientResponse(response);
    },

    /** URL firmada de descarga (caduca en un minuto). */
    async getStorageDownloadUrl(params: { bucket: string; path: string }) {
      const client = createHonoClient<DownloadFileRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.storage.buckets[':bucket'].download.$post({
          param: { bucket: params.bucket },
          json: { path: params.path },
        }),
      );
    },

    async renameStorageFile(params: {
      bucket: string;
      fromPath: string;
      toPath: string;
    }) {
      const client = createHonoClient<RenameFileRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.storage.buckets[':bucket'].rename.$put({
          param: { bucket: params.bucket },
          json: { fromPath: params.fromPath, toPath: params.toPath },
        }),
      );
    },

    /** Borra ficheros y carpetas (con todo su contenido). */
    async deleteStorageFiles(params: { bucket: string; paths: string[] }) {
      const client = createHonoClient<DeleteFileRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.storage.buckets[':bucket'].delete.$delete({
          param: { bucket: params.bucket },
          json: { paths: params.paths },
        }),
      );
    },

    async createStorageFolder(params: {
      bucket: string;
      parentPath: string;
      folderName: string;
    }) {
      const client = createHonoClient<CreateFolderRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.storage.buckets[':bucket']['create-folder'].$post({
          param: { bucket: params.bucket },
          json: {
            folderName: params.folderName,
            parentPath: params.parentPath,
          },
        }),
      );
    },

    /** Sube un fichero a una carpeta (`''` para la raíz). */
    async uploadStorageFile(params: {
      bucket: string;
      folder: string;
      file: File;
    }) {
      const client = createHonoClient<UploadFileRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.storage.buckets[':bucket'].upload.$post({
          param: { bucket: params.bucket },
          form: { file: params.file, folder: params.folder },
        }),
      );
    },
  };
}
