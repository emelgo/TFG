/**
 * Servicio de retorno de autenticación (*auth callback*).
 *
 * Procesa los enlaces que Supabase Auth envía por correo (confirmación de
 * email, enlace mágico, restablecer contraseña, invitaciones) y el retorno de
 * los proveedores OAuth: verifica el token o canjea el código por una sesión
 * y decide a qué página redirigir. Lo usan las rutas `/auth/callback` y
 * `/auth/confirm` de la web.
 *
 * Toda ruta de destino que llega por la URL se valida con
 * `isSafeRedirectPath` para impedir redirecciones abiertas (*open redirect*)
 * hacia dominios externos.
 */
import {
  AuthError,
  type EmailOtpType,
  SupabaseClient,
} from '@supabase/supabase-js';

import { isSafeRedirectPath } from '@pymekit/shared/utils';

/**
 * Crea el servicio de retorno de autenticación con el cliente de la
 * petición.
 */
export function createAuthCallbackService(client: SupabaseClient) {
  return new AuthCallbackService(client);
}

/** Lógica de los retornos de autenticación de Supabase. */
class AuthCallbackService {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Verifica el `token_hash` de un enlace enviado por correo y devuelve la URL
   * a la que redirigir: la página de destino si todo va bien o la página de
   * error con el motivo. Conserva los parámetros útiles del destino (por
   * ejemplo, `invite_token`) y elimina los propios de la autenticación.
   */
  async verifyTokenHash(
    request: Request,
    params: {
      joinTeamPath: string;
      redirectPath: string;
      errorPath?: string;
    },
  ): Promise<URL> {
    const url = new URL(request.url);
    const searchParams = url.searchParams;

    const host = request.headers.get('host');

    // Detrás de algunos proxies la URL de la petición llega con host
    // "localhost" o "0.0.0.0"; se usa la cabecera Host para construir la
    // redirección con el dominio real.
    this.adjustUrlHostForLocalDevelopment(url, host);

    url.pathname = params.redirectPath;

    const token_hash = searchParams.get('token_hash');
    const type = searchParams.get('type') as EmailOtpType | null;

    const redirectInfo = this.parseRedirectDestination(
      searchParams.get('next') ?? searchParams.get('callback'),
    );

    let nextPath: string | null = null;

    if (redirectInfo) {
      nextPath = redirectInfo.path;

      // Se conservan los parámetros del destino (por ejemplo, invite_token),
      // salvo 'next', para no duplicarlo.
      redirectInfo.params.forEach((value, key) => {
        if (key !== 'next') {
          url.searchParams.set(key, value);
        }
      });
    }

    const errorPath = params.errorPath ?? '/auth/callback/error';

    // El token no debe quedar en la URL final (historial, cabecera Referer).
    searchParams.delete('token_hash');
    searchParams.delete('type');
    searchParams.delete('next');
    searchParams.delete('callback');

    if (nextPath) {
      url.pathname = nextPath;
    }

    if (token_hash && type) {
      const { error } = await this.client.auth.verifyOtp({
        type,
        token_hash,
      });

      if (!error) {
        return url;
      }

      if (error.code) {
        url.searchParams.set('code', error.code);
      }

      const errorMessage = getAuthErrorMessage({
        error: error.message,
        code: error.code,
      });

      url.searchParams.set('error', errorMessage);
    }

    // Sin token o con un token no válido, se muestra la página de error con
    // instrucciones.
    url.pathname = errorPath;

    return url;
  }

  /**
   * Canjea el código de autorización (flujo PKCE de OAuth o del enlace
   * mágico) por una sesión y devuelve la ruta siguiente: el destino validado
   * o la página de error.
   */
  async exchangeCodeForSession(
    request: Request,
    params: {
      joinTeamPath: string;
      redirectPath: string;
      errorPath?: string;
    },
  ): Promise<{
    nextPath: string;
  }> {
    const requestUrl = new URL(request.url);
    const searchParams = requestUrl.searchParams;

    const authCode = searchParams.get('code');
    const error = searchParams.get('error');
    const nextUrlPathFromParams = searchParams.get('next');
    const errorPath = params.errorPath ?? '/auth/callback/error';

    // Se valida el destino para impedir redirecciones abiertas.
    const nextUrl =
      nextUrlPathFromParams && isSafeRedirectPath(nextUrlPathFromParams)
        ? nextUrlPathFromParams
        : params.redirectPath;

    if (authCode) {
      try {
        const { error } =
          await this.client.auth.exchangeCodeForSession(authCode);

        if (error) {
          return onError({
            code: error.code,
            error: error.message,
            path: errorPath,
          });
        }
      } catch (error) {
        console.error(
          {
            error,
            name: `auth.callback`,
          },
          `An error occurred while exchanging code for session`,
        );

        const message = error instanceof Error ? error.message : error;

        return onError({
          code: (error as AuthError)?.code,
          error: message as string,
          path: errorPath,
        });
      }
    }

    if (error) {
      return onError({
        error,
        path: errorPath,
      });
    }

    return {
      nextPath: nextUrl,
    };
  }

  private adjustUrlHostForLocalDevelopment(url: URL, host: string | null) {
    if (host && this.isLocalhost(url.host) && !this.isLocalhost(host)) {
      url.host = host;
      url.port = '';
    }
  }

  /**
   * Interpreta el parámetro de redirección y extrae la ruta de destino y sus
   * parámetros. Admite una ruta relativa o una URL completa (como la que pone
   * Supabase en `callback`) con un `next` anidado para redirecciones
   * encadenadas. Solo acepta rutas que superan `isSafeRedirectPath`.
   */
  private parseRedirectDestination(redirectParam: string | null): {
    path: string;
    params: URLSearchParams;
  } | null {
    if (!redirectParam) {
      return null;
    }

    // Primero se prueba como ruta relativa con una query string opcional.
    const [pathPart, queryPart] = redirectParam.split('?') as [
      string,
      string | undefined,
    ];

    if (isSafeRedirectPath(pathPart)) {
      return {
        path: pathPart,
        params: new URLSearchParams(queryPart ?? ''),
      };
    }

    // Después, como URL completa (por ejemplo, el parámetro callback).
    try {
      const url = new URL(redirectParam);

      // Un 'next' anidado es el destino final.
      const nestedNext = url.searchParams.get('next');

      if (nestedNext && isSafeRedirectPath(nestedNext)) {
        return {
          path: nestedNext,
          params: url.searchParams,
        };
      }

      // Sin 'next' anidado, se usa la ruta de la URL si es segura.
      if (isSafeRedirectPath(url.pathname)) {
        return {
          path: url.pathname,
          params: url.searchParams,
        };
      }
    } catch {
      // URL no válida: se ignora.
    }

    return null;
  }

  private isLocalhost(host: string | null) {
    if (!host) {
      return false;
    }

    return (
      host.includes('localhost:') ||
      host.includes('0.0.0.0:') ||
      host.includes('127.0.0.1:')
    );
  }
}

function onError({
  error,
  path,
  code,
}: {
  error: string;
  path: string;
  code?: string;
}) {
  const errorMessage = getAuthErrorMessage({ error, code });

  console.error(
    {
      error: JSON.stringify(error).replace(/["\\]/g, '\\$&'),
      name: `auth.callback`,
    },
    `An error occurred while signing user in`,
  );

  const searchParams = new URLSearchParams({
    error: errorMessage,
    code: code ?? '',
  });

  const nextPath = `${path}?${searchParams.toString()}`;

  return {
    nextPath,
  };
}

/**
 * Indica si el error se debe a que falta el *code verifier* de PKCE. Casi
 * siempre significa que el usuario abre el enlace en un navegador distinto
 * del que lo pidió; es un error habitual, así que merece un mensaje propio.
 */
function isVerifierError(error: string) {
  return error.includes('both auth code and code verifier should be non-empty');
}

/** Traduce un error de Supabase Auth a una clave i18n para la interfaz. */
function getAuthErrorMessage(params: { error: string; code?: string }) {
  // Enlace de correo caducado.
  if (params.code) {
    if (params.code === 'otp_expired') {
      return 'auth.errors.otp_expired';
    }
  }

  // Enlace abierto en un navegador distinto del que lo solicitó.
  if (isVerifierError(params.error)) {
    return 'auth.errors.codeVerifierMismatch';
  }

  // Cualquier otro error: mensaje genérico.
  return `auth.authenticationErrorAlertBody`;
}
