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

import type { CmsApi } from './api';
import { shouldRetryCmsQuery } from './errors';

/** Claves de caché de TanStack Query del CMS. */
export const cmsQueryKeys = {
  all: ['cms'] as const,
  account: () => [...cmsQueryKeys.all, 'account'] as const,
  navigation: () => [...cmsQueryKeys.all, 'navigation'] as const,
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
  };
}

export type CmsQueries = ReturnType<typeof createCmsQueries>;
