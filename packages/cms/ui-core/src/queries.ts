/**
 * Consultas de TanStack Query de la interfaz del CMS.
 *
 * Centraliza las claves de caché (`cmsQueryKeys`) y las opciones de cada
 * consulta (`queryOptions`) para que el *loader* de una ruta
 * (`context.queryClient.ensureQueryData(...)`) y los componentes
 * (`useQuery(...)`) compartan exactamente la misma entrada de caché: lo que
 * carga el servidor durante el SSR se hidrata en el navegador sin repetir la
 * petición.
 */
import { queryOptions } from '@tanstack/react-query';

import type { CmsApi, TableDataParams } from './api';
import { shouldRetryCmsQuery } from './errors';

/** Claves de caché de TanStack Query del CMS. */
export const cmsQueryKeys = {
  all: ['cms'] as const,
  account: () => [...cmsQueryKeys.all, 'account'] as const,
  navigation: () => [...cmsQueryKeys.all, 'navigation'] as const,
  /** Prefijo común de todo lo que depende de una tabla concreta. */
  table: (schema: string, table: string) =>
    [...cmsQueryKeys.all, 'tables', schema, table] as const,
  tableData: (params: TableDataParams) =>
    [
      ...cmsQueryKeys.table(params.schema, params.table),
      'data',
      {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? null,
        search: params.search ?? '',
        sortColumn: params.sortColumn ?? null,
        sortDirection: params.sortDirection ?? null,
        filters: params.filters ?? {},
      },
    ] as const,
  savedViews: (schema: string, table: string) =>
    [...cmsQueryKeys.table(schema, table), 'views'] as const,
  rolesForSharing: () => [...cmsQueryKeys.all, 'roles', 'sharing'] as const,
};

/**
 * Crea las opciones de consulta de la interfaz base del CMS a partir de las
 * funciones de acceso a la API (`createCmsApi`).
 */
export function createCmsQueries(api: CmsApi) {
  return {
    /** Cuenta del CMS del usuario y secciones que puede usar. */
    account: () =>
      queryOptions({
        queryKey: cmsQueryKeys.account(),
        queryFn: () => api.getAccount(),
        retry: shouldRetryCmsQuery,
      }),

    /** Tablas que el usuario puede leer (explorador de datos). */
    navigation: () =>
      queryOptions({
        queryKey: cmsQueryKeys.navigation(),
        queryFn: () => api.getNavigation(),
        retry: shouldRetryCmsQuery,
      }),

    /**
     * Una página del listado de una tabla. La clave incluye todos los
     * parámetros (página, búsqueda, orden y filtros), así que cada
     * combinación tiene su propia entrada de caché y volver atrás es
     * instantáneo durante `staleTime`.
     */
    tableData: (params: TableDataParams) =>
      queryOptions({
        queryKey: cmsQueryKeys.tableData(params),
        queryFn: () => api.getTableData(params),
        retry: shouldRetryCmsQuery,
        staleTime: 30 * 1000,
      }),

    /** Vistas guardadas (personales y de equipo) de una tabla. */
    savedViews: (schema: string, table: string) =>
      queryOptions({
        queryKey: cmsQueryKeys.savedViews(schema, table),
        queryFn: () => api.getSavedViews({ schema, table }),
        retry: shouldRetryCmsQuery,
        staleTime: 30 * 1000,
      }),

    /** Roles del CMS con los que se puede compartir una vista guardada. */
    rolesForSharing: () =>
      queryOptions({
        queryKey: cmsQueryKeys.rolesForSharing(),
        queryFn: () => api.getRolesForSharing(),
        retry: shouldRetryCmsQuery,
        staleTime: 5 * 60 * 1000,
      }),
  };
}

export type CmsQueries = ReturnType<typeof createCmsQueries>;
