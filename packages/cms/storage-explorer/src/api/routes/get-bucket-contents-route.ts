/**
 * `GET /v1/storage/buckets/:bucket/contents`: una página del contenido de
 * una carpeta del almacenamiento.
 *
 * La carpeta va en `path` (vacío para la raíz del *bucket*). Se valida aquí
 * con las reglas compartidas y el servicio exige además el permiso `select`
 * sobre ella; cada elemento lleva los permisos del usuario sobre su ruta
 * exacta y, si es una imagen legible, una URL firmada de vista previa de
 * corta duración.
 *
 * [TFG] RF-09 · RNF-02.
 */
import { zValidator } from '@hono/zod-validator';
import type { Hono } from 'hono';
import { z } from 'zod';

import {
  STORAGE_LIMITS,
  isValidFolderPath,
} from '@pymekit/cms-shared/storage-paths';

import { createStorageService } from '../services/storage.service';
import {
  BucketParamsSchema,
  invalidStorageInput,
  respondWithStorageError,
} from './file-operations-route';

const BucketContentsQuerySchema = z.object({
  path: z
    .string()
    .max(STORAGE_LIMITS.maxPathLength)
    .refine(isValidFolderPath, 'Invalid folder path')
    .optional()
    .default(''),
  search: z.string().max(255).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});

/** Registra la ruta del contenido de una carpeta. */
export function registerBucketContentsRouter(router: Hono) {
  return router.get(
    '/v1/storage/buckets/:bucket/contents',
    zValidator('param', BucketParamsSchema, invalidStorageInput),
    zValidator('query', BucketContentsQuerySchema, invalidStorageInput),
    async (c) => {
      const { bucket } = c.req.valid('param');
      const { path, search, page, limit } = c.req.valid('query');

      try {
        const result = await createStorageService(c).getBucketContents({
          bucket,
          path,
          search,
          page,
          limit,
        });

        return c.json(result);
      } catch (error) {
        return respondWithStorageError(
          c,
          error,
          { bucket, path },
          'Error getting bucket contents',
        );
      }
    },
  );
}

export type GetBucketContentsRoute = ReturnType<
  typeof registerBucketContentsRouter
>;
