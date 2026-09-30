/**
 * Indica si el componente ya se ha hidratado en el navegador.
 *
 * Las pantallas del CMS se renderizan primero en el servidor (SSR); hasta que
 * React hidrata la página, sus botones no responden. Las vistas lo exponen
 * como atributo `data-hydrated` para que las pruebas E2E esperen a ese
 * momento en lugar de pulsar demasiado pronto. Se usa
 * `useSyncExternalStore` (y no un `useEffect`) porque da `false` en el
 * servidor y `true` en el cliente sin un render intermedio.
 */
import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

export function useIsHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
