/**
 * *Search params* del explorador de almacenamiento
 * (`/admin/cms/storage/$bucket?path=…&page=…&search=…`).
 *
 * La carpeta abierta vive en la URL (`path`), así que se puede compartir un
 * enlace a una carpeta y el botón «atrás» funciona. La URL la escribe
 * cualquiera, por eso `path` se valida con las mismas reglas que la API
 * (`isValidFolderPath`: sin `..`, absolutas ni codificaciones) y, si no es
 * válida, se vuelve a la raíz del *bucket* en lugar de enviarla. La API la
 * rechazaría igualmente con 400.
 */
import * as z from 'zod';

import {
  STORAGE_LIMITS,
  isValidFolderPath,
} from '@pymekit/cms-shared/storage-paths';
import type { BucketContentsParams } from '@pymekit/cms-ui-core/storage-api';

export const StorageSearchSchema = z.object({
  path: z
    .string()
    .max(STORAGE_LIMITS.maxPathLength)
    .refine(isValidFolderPath)
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  search: z.string().trim().max(255).optional().catch(undefined),
});

export type StorageSearch = z.infer<typeof StorageSearchSchema>;

/** Traduce la URL a los parámetros de la API. */
export function toBucketContentsParams(
  bucket: string,
  search: StorageSearch,
): BucketContentsParams {
  return {
    bucket,
    path: search.path ?? '',
    search: search.search || undefined,
    page: search.page && search.page > 1 ? search.page : undefined,
  };
}

/** URL de una carpeta: sin página ni búsqueda (se empieza de cero). */
export function withFolder(path: string): StorageSearch {
  return { path: path || undefined, page: undefined, search: undefined };
}

/**
 * Segmentos de la ruta para las migas de pan: cada uno con la ruta de la
 * carpeta a la que lleva.
 */
export function getFolderBreadcrumbs(path: string) {
  const segments = path ? path.split('/') : [];

  return segments.map((name, index) => ({
    name,
    path: segments.slice(0, index + 1).join('/'),
  }));
}
