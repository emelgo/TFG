/**
 * Rutas de escritura y descarga del explorador de almacenamiento.
 *
 *  - `PUT    /v1/storage/buckets/:bucket/rename`: renombrar/mover un fichero.
 *  - `DELETE /v1/storage/buckets/:bucket/delete`: borrar ficheros y carpetas.
 *  - `POST   /v1/storage/buckets/:bucket/download`: URL firmada de descarga.
 *  - `POST   /v1/storage/buckets/:bucket/create-folder`: crear una carpeta.
 *  - `POST   /v1/storage/buckets/:bucket/upload`: subir un fichero
 *    (`multipart/form-data`, con límite de tamaño del cuerpo).
 *
 * Los esquemas Zod rechazan de entrada nombres de *bucket* y rutas no válidos
 * (las mismas reglas que vuelve a aplicar el servicio). Los errores se
 * responden con un código estable (`STORAGE_*`) y un mensaje genérico
 * (`classifyStorageError`), nunca con el texto de Storage o de PostgreSQL.
 *
 * [TFG] RF-09 · RNF-02.
 */
import { zValidator } from '@hono/zod-validator';
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import {
  STORAGE_LIMITS,
  getFileNameError,
  isValidBucketName,
  isValidFilePath,
  isValidFolderPath,
} from '@pymekit/cms-shared/storage-paths';
import { getLogger } from '@pymekit/shared/logger';

import { classifyStorageError } from '../../utils/storage-errors';
import { createStorageService } from '../services/storage.service';

/**
 * Respuesta de los validadores Zod cuando la entrada no es válida: un 400 con
 * el código estable `STORAGE_INVALID_PATH` en lugar del detalle de Zod, igual
 * para todas las rutas del explorador.
 */
export function invalidStorageInput(result: { success: boolean }, c: Context) {
  if (!result.success) {
    return c.json(
      {
        success: false as const,
        error: 'The bucket, path or file name is not valid',
        errorCode: CMS_API_ERROR_CODES.STORAGE_INVALID_PATH,
      },
      400,
    );
  }
}

/** Parámetro `:bucket` de todas las rutas del explorador. */
export const BucketParamsSchema = z.object({
  bucket: z.string().refine(isValidBucketName, 'Invalid bucket name'),
});

const FilePathSchema = z
  .string()
  .max(STORAGE_LIMITS.maxPathLength)
  .refine(isValidFilePath, 'Invalid file path');

const FolderPathSchema = z
  .string()
  .max(STORAGE_LIMITS.maxPathLength)
  .refine(isValidFolderPath, 'Invalid folder path');

const RenameFileSchema = z.object({
  fromPath: FilePathSchema,
  toPath: FilePathSchema,
});

const DeleteFileSchema = z.object({
  paths: z.array(FilePathSchema).min(1).max(STORAGE_LIMITS.maxBatchSize),
});

const DownloadFileSchema = z.object({
  path: FilePathSchema,
});

const CreateFolderSchema = z.object({
  folderName: z
    .string()
    .refine((name) => getFileNameError(name) === null, 'Invalid folder name'),
  parentPath: FolderPathSchema.optional().default(''),
});

const UploadFileSchema = z.object({
  file: z.instanceof(File),
  folder: FolderPathSchema.optional().default(''),
});

/**
 * Responde a un error del explorador con su código estable. El error
 * original (con rutas y el texto de Storage) solo va al *log*.
 */
export async function respondWithStorageError(
  c: Context,
  error: unknown,
  logContext: Record<string, unknown>,
  logMessage: string,
) {
  const logger = await getLogger();
  const { status, errorCode, message } = classifyStorageError(error);

  if (status >= 500) {
    logger.error({ error, ...logContext }, logMessage);
  } else {
    logger.warn({ error, ...logContext }, logMessage);
  }

  return c.json({ success: false, error: message, errorCode }, status);
}

/** Registra las rutas de escritura y descarga del explorador. */
export function registerFileOperationsRouter(router: Hono) {
  registerRenameFileRouter(router);
  registerDeleteFileRouter(router);
  registerDownloadFileRouter(router);
  registerCreateFolderRouter(router);
  registerUploadFileRouter(router);
}

function registerRenameFileRouter(router: Hono) {
  return router.put(
    '/v1/storage/buckets/:bucket/rename',
    zValidator('param', BucketParamsSchema, invalidStorageInput),
    zValidator('json', RenameFileSchema, invalidStorageInput),
    async (c) => {
      const { bucket } = c.req.valid('param');
      const { fromPath, toPath } = c.req.valid('json');

      try {
        const result = await createStorageService(c).renameFile({
          bucket,
          fromPath,
          toPath,
        });

        return c.json(result);
      } catch (error) {
        return respondWithStorageError(
          c,
          error,
          { bucket, fromPath, toPath },
          'Error renaming file',
        );
      }
    },
  );
}

function registerDeleteFileRouter(router: Hono) {
  return router.delete(
    '/v1/storage/buckets/:bucket/delete',
    zValidator('param', BucketParamsSchema, invalidStorageInput),
    zValidator('json', DeleteFileSchema, invalidStorageInput),
    async (c) => {
      const { bucket } = c.req.valid('param');
      const { paths } = c.req.valid('json');

      try {
        const result = await createStorageService(c).deleteFiles({
          bucket,
          paths,
        });

        return c.json(result);
      } catch (error) {
        return respondWithStorageError(
          c,
          error,
          { bucket, paths },
          'Error deleting files',
        );
      }
    },
  );
}

function registerDownloadFileRouter(router: Hono) {
  return router.post(
    '/v1/storage/buckets/:bucket/download',
    zValidator('param', BucketParamsSchema, invalidStorageInput),
    zValidator('json', DownloadFileSchema, invalidStorageInput),
    async (c) => {
      const { bucket } = c.req.valid('param');
      const { path } = c.req.valid('json');

      try {
        const downloadUrl = await createStorageService(c).getDownloadUrl({
          bucket,
          path,
        });

        return c.json({ downloadUrl });
      } catch (error) {
        return respondWithStorageError(
          c,
          error,
          { bucket, path },
          'Error getting download URL',
        );
      }
    },
  );
}

function registerCreateFolderRouter(router: Hono) {
  return router.post(
    '/v1/storage/buckets/:bucket/create-folder',
    zValidator('param', BucketParamsSchema, invalidStorageInput),
    zValidator('json', CreateFolderSchema, invalidStorageInput),
    async (c) => {
      const { bucket } = c.req.valid('param');
      const { folderName, parentPath } = c.req.valid('json');

      try {
        const result = await createStorageService(c).createFolder({
          bucket,
          folderName,
          parentPath,
        });

        return c.json(result);
      } catch (error) {
        return respondWithStorageError(
          c,
          error,
          { bucket, folderName, parentPath },
          'Error creating folder',
        );
      }
    },
  );
}

function registerUploadFileRouter(router: Hono) {
  return router.post(
    '/v1/storage/buckets/:bucket/upload',
    // El límite se aplica al cuerpo entero ANTES de leerlo: un envío enorme
    // se corta sin cargarlo en memoria. Se deja margen para las cabeceras
    // del `multipart`; el servicio vuelve a medir el fichero.
    bodyLimit({
      maxSize: STORAGE_LIMITS.maxUploadBytes + 64 * 1024,
      onError: (c) =>
        c.json(
          {
            success: false,
            error: 'The file is larger than the maximum upload size',
            errorCode: CMS_API_ERROR_CODES.STORAGE_FILE_TOO_LARGE,
          },
          413,
        ),
    }),
    zValidator('param', BucketParamsSchema, invalidStorageInput),
    zValidator('form', UploadFileSchema, invalidStorageInput),
    async (c) => {
      const { bucket } = c.req.valid('param');
      const { file, folder } = c.req.valid('form');

      try {
        const result = await createStorageService(c).uploadFile({
          bucket,
          folder,
          file,
        });

        return c.json(result);
      } catch (error) {
        return respondWithStorageError(
          c,
          error,
          { bucket, folder, fileName: file.name },
          'Error uploading file',
        );
      }
    },
  );
}

export type RenameFileRoute = ReturnType<typeof registerRenameFileRouter>;
export type DeleteFileRoute = ReturnType<typeof registerDeleteFileRouter>;
export type DownloadFileRoute = ReturnType<typeof registerDownloadFileRouter>;
export type CreateFolderRoute = ReturnType<typeof registerCreateFolderRouter>;
export type UploadFileRoute = ReturnType<typeof registerUploadFileRouter>;
