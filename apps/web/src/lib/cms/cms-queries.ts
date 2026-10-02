/**
 * Consultas del CMS configuradas para la web.
 *
 * Une las piezas genéricas de `@pymekit/cms-ui-core` (funciones de la API y
 * opciones de TanStack Query) con el `fetch` isomorfo de la web
 * (`cmsFetch`), de modo que las mismas consultas sirven en los *loaders*
 * durante el SSR y en los componentes del navegador.
 */
import { createCmsApi } from '@pymekit/cms-ui-core/api';
import { createCmsQueries } from '@pymekit/cms-ui-core/queries';

import { cmsFetch } from './cms-fetch.ts';

/** Funciones de acceso a la API del CMS de la interfaz base. */
export const cmsApi = createCmsApi({ fetch: cmsFetch });

/** Opciones de TanStack Query de la interfaz base del CMS. */
export const cmsQueries = createCmsQueries(cmsApi);

/**
 * Valor de `CmsApiProvider` (instancia estable): la API y las consultas con
 * las que los componentes de los paquetes del CMS comparten caché con los
 * *loaders*. Lo usan el *layout* del CMS y la búsqueda global de la barra
 * lateral de la consola.
 */
export const cmsApiContext = { api: cmsApi, queries: cmsQueries };
