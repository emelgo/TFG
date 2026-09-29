/**
 * Contexto React con el acceso a la API del CMS desde los componentes.
 *
 * Las consultas de los *loaders* usan directamente las instancias que crea la
 * web (`apps/web/src/lib/cms/cms-queries.ts`), pero los componentes de los
 * paquetes del CMS (filtros, vistas guardadas, autocompletado…) no pueden
 * importar código de la web. El *layout* `/admin/cms` publica aquí esas mismas
 * instancias, construidas con el `fetch` isomorfo, y los componentes las leen
 * con `useCmsApi()`. Así todos comparten caché y forma de llamar a la API, y
 * este paquete sigue sin saber nada de TanStack Start.
 */
import { createContext, useContext } from 'react';

import type { CmsApi } from './api';
import type { CmsQueries } from './queries';

type CmsApiContextValue = {
  /** Funciones de acceso a la API (para mutaciones y llamadas puntuales). */
  api: CmsApi;
  /** Opciones de TanStack Query (para `useQuery`/`useSuspenseQuery`). */
  queries: CmsQueries;
};

const CmsApiContext = createContext<CmsApiContextValue | null>(null);

/** Publica la API del CMS para los componentes descendientes. */
export function CmsApiProvider(
  props: React.PropsWithChildren<{ value: CmsApiContextValue }>,
) {
  return (
    <CmsApiContext.Provider value={props.value}>
      {props.children}
    </CmsApiContext.Provider>
  );
}

/**
 * Devuelve las funciones y las consultas de la API del CMS.
 *
 * @throws Si se usa fuera de `/admin/cms`: es un error de programación.
 */
export function useCmsApi() {
  const value = useContext(CmsApiContext);

  if (!value) {
    throw new Error('useCmsApi must be used inside CmsApiProvider');
  }

  return value;
}
