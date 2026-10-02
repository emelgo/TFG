/**
 * Errores de carga de las secciones «Usuarios» y «Almacenamiento» del CMS.
 *
 * Los `loader` de sus rutas precargan con `ensureQueryData` la misma entrada
 * de caché que el componente lee con `useSuspenseQuery` (también en el SSR).
 * Si la API responde 403 (sin permiso), 404 (el usuario o el *bucket* no
 * existen) o 400 (una carpeta manipulada a mano en la URL), la página se
 * muestra como «no encontrado», igual que el resto de la consola: no se
 * distingue lo que no existe de lo que el usuario no puede ver. Cualquier
 * otro error llega al `errorComponent` de la ruta.
 */
import { notFound } from '@tanstack/react-router';

import { ApiError } from '@pymekit/cms-api/client';
import { getCmsAccessFailure } from '@pymekit/cms-ui-core/errors';

/** Relanza el error como `notFound()` si es de acceso o de «no existe». */
export function rethrowCmsSectionError(error: unknown): never {
  if (
    getCmsAccessFailure(error) === 'forbidden' ||
    (error instanceof ApiError &&
      (error.status === 404 || error.status === 400))
  ) {
    throw notFound();
  }

  throw error;
}
