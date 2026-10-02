/**
 * `GET /v1/storage/buckets`: los *buckets* cuya raíz puede leer el usuario.
 *
 * Sin ningún permiso de almacenamiento la lista está vacía (y la sección
 * «Almacenamiento» ni siquiera aparece en la barra lateral).
 *
 * [TFG] RF-09 · RNF-02.
 */
import type { Hono } from 'hono';

import { createStorageService } from '../services/storage.service';
import { respondWithStorageError } from './file-operations-route';

/** Registra la ruta de la lista de *buckets*. */
export function registerStorageBucketsRouter(router: Hono) {
  return router.get('/v1/storage/buckets', async (c) => {
    try {
      const buckets = await createStorageService(c).getBuckets();

      return c.json({ buckets });
    } catch (error) {
      return respondWithStorageError(
        c,
        error,
        {},
        'Error getting storage buckets',
      );
    }
  });
}

export type GetStorageBucketsRoute = ReturnType<
  typeof registerStorageBucketsRouter
>;
