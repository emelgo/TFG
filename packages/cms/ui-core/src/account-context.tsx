/**
 * Contexto React con la cuenta del CMS del usuario actual.
 *
 * El *layout* `/admin/cms` carga una sola vez la cuenta del CMS y sus
 * secciones accesibles (`GET /v1/account`) y la publica con
 * `CmsAccountProvider`. Las pantallas del CMS la leen con `useCmsAccount()`
 * en lugar de repetir la petición o recibirla por *props* a través de toda la
 * jerarquía, igual que la app usa `useWorkspace()` para la cuenta activa.
 */
import { createContext, useContext } from 'react';

import type { CmsAccountData } from './api';

const CmsAccountContext = createContext<CmsAccountData | null>(null);

/** Publica la cuenta del CMS para los componentes descendientes. */
export function CmsAccountProvider(
  props: React.PropsWithChildren<{ value: CmsAccountData }>,
) {
  return (
    <CmsAccountContext.Provider value={props.value}>
      {props.children}
    </CmsAccountContext.Provider>
  );
}

/**
 * Devuelve la cuenta del CMS del usuario (`account`) y las secciones que
 * puede usar (`access`).
 *
 * @throws Si se usa fuera de `/admin/cms`, donde no hay proveedor: es un
 *   error de programación, no un caso que deba tratar la interfaz.
 */
export function useCmsAccount() {
  const value = useContext(CmsAccountContext);

  if (!value) {
    throw new Error('useCmsAccount must be used inside CmsAccountProvider');
  }

  return value;
}
