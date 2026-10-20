'use client';

import { useEffect, useEffectEvent } from 'react';

import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

import { useSupabase } from './use-supabase';

/**
 * Prefijos de las rutas privadas: si la sesión se cierra mientras el usuario
 * está en una de ellas, se le saca de la página.
 */
const PRIVATE_PATH_PREFIXES = [
  '/dashboard',
  '/settings',
  '/create-team',
  '/admin',
  '/join',
  '/identities',
  '/update-password',
];

/** Prefijos de las páginas de autenticación. */
const AUTH_PATHS = ['/auth'];

/**
 * Escucha los cambios de sesión de Supabase Auth en el navegador.
 *
 * Mantiene la interfaz coherente con la sesión cuando cambia fuera de la
 * pestaña actual (por ejemplo, al cerrar sesión en otra pestaña o al caducar
 * el token): si el usuario se queda sin sesión en una ruta privada, se le
 * envía a la página de inicio, y ante un `SIGNED_OUT` se recarga la página
 * para que el servidor vuelva a evaluar el acceso. Es solo una ayuda de
 * experiencia de usuario: la protección real está en el servidor y en la RLS.
 *
 * @param privatePathPrefixes Prefijos de rutas privadas (por defecto,
 *   {@link PRIVATE_PATH_PREFIXES}).
 * @param onEvent Función opcional que se llama con cada evento de sesión.
 */
export function useAuthChangeListener({
  privatePathPrefixes = PRIVATE_PATH_PREFIXES,
  onEvent,
}: {
  privatePathPrefixes?: string[];
  onEvent?: (event: AuthChangeEvent, user: Session | null) => void;
}) {
  const client = useSupabase();

  const setupAuthListener = useEffectEvent(() => {
    // En el servidor no hay sesión del navegador que escuchar.
    if (typeof window === 'undefined') {
      return;
    }

    // La suscripción dura mientras el componente esté montado.
    return client.auth.onAuthStateChange((event, user) => {
      const pathName = window.location.pathname;

      if (onEvent) {
        onEvent(event, user);
      }

      // Sin sesión en una ruta privada: hay que salir de ella.
      const shouldRedirectUser =
        !user && isPrivateRoute(pathName, privatePathPrefixes);

      if (shouldRedirectUser) {
        window.location.assign('/');

        return;
      }

      if (event === 'SIGNED_OUT') {
        // En las páginas de autenticación Supabase emite a veces SIGNED_OUT
        // durante el propio flujo de inicio de sesión; recargar ahí lo
        // interrumpiría, así que se ignora.
        if (AUTH_PATHS.some((path) => pathName.startsWith(path))) {
          return;
        }

        window.location.reload();
      }
    });
  });

  // useEffect justificado: hay que suscribirse a un sistema externo (los
  // eventos de Supabase Auth) y cancelar la suscripción al desmontar.
  useEffect(() => {
    const listener = setupAuthListener();

    return () => {
      listener?.data.subscription.unsubscribe();
    };
  }, []);
}

/** Indica si la ruta empieza por alguno de los prefijos privados. */
function isPrivateRoute(path: string, privatePathPrefixes: string[]) {
  return privatePathPrefixes.some((prefix) => path.startsWith(prefix));
}
