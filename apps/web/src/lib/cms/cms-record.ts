/**
 * Carga de la ficha de un registro del explorador de datos del CMS.
 *
 * La comparten las dos rutas de la ficha (`.../record/$id` y
 * `.../record?col=valor`, para claves compuestas). Precarga en la caché de
 * TanStack Query todo lo que la página lee con `useSuspenseQuery`, también
 * durante el SSR:
 *
 *  - la ficha (`GET /v1/tables/:schema/:table/record`), con sus claves
 *    foráneas legibles ya resueltas;
 *  - las tablas legibles (`GET /v1/navigation`), que deciden qué secciones
 *    de registros relacionados se muestran.
 *
 * Un 403 (tabla sin permiso) o un 404 (la clave no existe) de la API se
 * convierten en «no encontrado», igual que en el listado: la consola no
 * distingue entre lo que no existe y lo que el usuario no puede ver.
 *
 * Desde F2.4c también prepara las páginas de escritura (crear y editar): se
 * abren solo si el usuario tiene el permiso (`insert` o `update`) y, si no,
 * responden «no encontrado». No es la barrera de seguridad —la API vuelve a
 * comprobarlo al guardar—, pero evita mostrar un formulario que fallaría.
 */
import type { QueryClient } from '@tanstack/react-query';
import { notFound } from '@tanstack/react-router';

import { ApiError } from '@pymekit/cms-api/client';
import {
  conditionsIdentifyOneRecord,
  resolveSingleKeyColumn,
} from '@pymekit/cms-data-explorer-ui/utils';
import { getCmsAccessFailure } from '@pymekit/cms-ui-core/errors';

import { cmsQueries } from './cms-queries.ts';

/** Lanza `notFound()` si el error de la API es un 403 o un 404. */
function rethrowAsNotFound(error: unknown): never {
  if (
    getCmsAccessFailure(error) === 'forbidden' ||
    (error instanceof ApiError && error.status === 404)
  ) {
    throw notFound();
  }

  throw error;
}

/**
 * Precarga la ficha del registro identificado por `keys` (columna → valor)
 * y las tablas legibles.
 */
export async function loadCmsRecord(
  queryClient: QueryClient,
  params: { schema: string; table: string; keys: Record<string, string> },
) {
  if (Object.keys(params.keys).length === 0) {
    throw notFound();
  }

  try {
    await Promise.all([
      queryClient.ensureQueryData(cmsQueries.record(params)),
      queryClient.ensureQueryData(cmsQueries.navigation()),
    ]);
  } catch (error) {
    rethrowAsNotFound(error);
  }
}

/**
 * Resuelve la columna del valor de `.../record/$id` a partir del metadato de
 * la tabla (su clave primaria de una columna, como hace el enlace) y precarga
 * la ficha. Devuelve las claves para que el componente lea la misma entrada
 * de caché.
 */
export async function loadCmsRecordById(
  queryClient: QueryClient,
  params: { schema: string; table: string; id: string },
) {
  let keys: Record<string, string>;

  try {
    const metadata = await queryClient.ensureQueryData(
      cmsQueries.tableMetadata(params.schema, params.table),
    );

    keys = { [resolveSingleKeyColumn(metadata.table.uiConfig)]: params.id };
  } catch (error) {
    rethrowAsNotFound(error);
  }

  await loadCmsRecord(queryClient, { ...params, keys });

  return { keys };
}

/**
 * Precarga la ficha para su página de edición y comprueba que el usuario
 * puede actualizar la tabla (`permissions.canUpdate`, que la API devuelve con
 * la ficha). Sin permiso, «no encontrado».
 */
export async function loadCmsRecordForEdit(
  queryClient: QueryClient,
  params: { schema: string; table: string; keys: Record<string, string> },
) {
  await loadCmsRecord(queryClient, params);

  const record = queryClient.getQueryData(cmsQueries.record(params).queryKey);

  // Además del permiso, las columnas de la URL deben ser la clave primaria o
  // una restricción única: si no, guardar cambiaría todas las filas que
  // coincidan (la API también lo rechaza).
  if (
    !record?.permissions.canUpdate ||
    !conditionsIdentifyOneRecord(
      Object.keys(params.keys),
      record.metadata.table.uiConfig,
    )
  ) {
    throw notFound();
  }
}

/**
 * Precarga el metadato de la tabla para la página «Nuevo registro» y
 * comprueba el permiso `insert`. Sin permiso (o sin acceso a la tabla),
 * «no encontrado».
 */
export async function loadCmsTableForCreate(
  queryClient: QueryClient,
  params: { schema: string; table: string },
) {
  try {
    const [permissions] = await Promise.all([
      queryClient.ensureQueryData(
        cmsQueries.tablePermissions(params.schema, params.table),
      ),
      queryClient.ensureQueryData(
        cmsQueries.tableMetadata(params.schema, params.table),
      ),
    ]);

    if (!permissions.canInsert) {
      throw notFound();
    }
  } catch (error) {
    rethrowAsNotFound(error);
  }
}
