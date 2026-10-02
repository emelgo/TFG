/**
 * Carga de datos de Ajustes > Recursos para las rutas de una tabla
 * (configuración y diseñador de la ficha, F2.7c).
 *
 * Comparten el mismo `loader`: validan el esquema y la tabla de la URL con
 * la misma regla de identificadores que la API (un nombre no válido es «no
 * encontrado» sin llegar a pedir nada) y precargan el metadato con
 * `ensureQueryData`. Los 403/404 de la API también acaban en «no
 * encontrado» (`rethrowCmsSectionError`).
 *
 * [TFG] RF-09 · ADR-013.
 */
import type { QueryClient } from '@tanstack/react-query';
import { notFound } from '@tanstack/react-router';

import { isValidPgIdentifier } from '@pymekit/cms-settings-ui/utils';

import type { CmsAccessState } from './cms-access.ts';
import { cmsQueries } from './cms-queries.ts';
import { rethrowCmsSectionError } from './cms-section-data.ts';

/** Precarga el metadato de una tabla de Ajustes > Recursos. */
export async function loadResourceSettings(
  context: { queryClient: QueryClient; cmsAccess: CmsAccessState },
  params: { schema: string; table: string },
) {
  if (context.cmsAccess.status !== 'ok') {
    return;
  }

  if (
    !isValidPgIdentifier(params.schema) ||
    !isValidPgIdentifier(params.table)
  ) {
    throw notFound();
  }

  try {
    await context.queryClient.ensureQueryData(
      cmsQueries.resourceSettingsTable(params.schema, params.table),
    );
  } catch (error) {
    rethrowCmsSectionError(error);
  }
}
