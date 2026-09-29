/**
 * Cliente RPC de la API del CMS (lado navegador).
 *
 * La interfaz del CMS (rutas `/admin/cms/*`) llamará a la API Hono montada en
 * `/api/cms/*` con este cliente tipado: los tipos de las rutas se importan de
 * los paquetes `@pymekit/cms-<funcionalidad>/routes` solo como tipos, y la
 * respuesta se desenvuelve con `handleHonoClientResponse`, que lanza un
 * `ApiError` si la API devuelve un error.
 *
 * Este módulo no importa nada de servidor: es seguro en el *bundle* del
 * cliente.
 *
 * [TFG] RF-09 · ADR-011: la interfaz y la API del CMS se comunican por RPC
 * tipado dentro de la misma aplicación.
 */
import type { Hono } from 'hono';
import { type ClientResponse, hc } from 'hono/client';
import type { ResponseFormat } from 'hono/types';

/**
 * Custom error class for API responses that preserves additional error data.
 * Use this to access errorCode and other fields from failed API responses.
 */
export class ApiError extends Error {
  /** Error code from the API response (e.g., 'PERMISSION_DENIED', 'ALREADY_LINKED') */
  errorCode?: string;
  /** HTTP status code */
  status?: number;
  /** Full response data for advanced error handling */
  data?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      errorCode?: string;
      status?: number;
      data?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = 'ApiError';
    this.errorCode = options?.errorCode;
    this.status = options?.status;
    this.data = options?.data;
  }
}

/**
 * Ruta base de la API del CMS dentro de la web. Es relativa: el navegador la
 * resuelve contra el origen actual, así que no hace falta configurar ninguna
 * URL ni habilitar CORS (misma origen).
 */
export const CMS_API_BASE_PATH = '/api/cms';

type HonoClient<T extends Hono> = ReturnType<typeof hc<T>>;

/**
 * Crea un cliente RPC tipado de Hono para una ruta de la API del CMS.
 *
 * El tipo `T` es el de la ruta que se quiere llamar (por ejemplo,
 * `GetNavigationRoute` de `@pymekit/cms-navigation/routes`), importado con
 * `import type`, de modo que el código de servidor nunca llega al navegador.
 * Las peticiones incluyen las *cookies* de sesión de la web.
 *
 * @param options.baseUrl Origen absoluto opcional, para llamar a la API desde
 *   el servidor (por ejemplo, en un *loader* durante el SSR), donde una ruta
 *   relativa no se puede resolver.
 * @param options.fetch Implementación de `fetch` alternativa. La web la usa
 *   durante el SSR para atender la petición dentro del propio proceso (sin
 *   salir a la red) reenviando las *cookies* de la petición entrante.
 */
export function createHonoClient<T extends Hono>(
  options: { baseUrl?: string; fetch?: typeof fetch } = {},
): HonoClient<T> {
  const url = options.baseUrl
    ? new URL(CMS_API_BASE_PATH, options.baseUrl).toString()
    : CMS_API_BASE_PATH;

  return hc<T>(url, {
    fetch: options.fetch,
    init: {
      credentials: 'include',
    },
  });
}

/**
 * Extracts the success response type from a ClientResponse union, excluding
 * every error-shaped body.
 *
 * Hono returns a union of `ClientResponse`s (one per status code). Error bodies
 * take two forms that must BOTH be excluded so consumers get a clean success
 * type:
 *   - Application errors: `{ success: false; error: string }`.
 *   - Zod validation errors (`@hono/zod-validator` on a 400): `ZodSafeParseError`,
 *     i.e. `{ success: false; error: ZodError }`. Its `error` is a ZodError
 *     object, not a string, so a `{ error: string }`-only check let it leak into
 *     the success union and broke property access on consumers.
 *
 * Excluding `{ success: false }` covers both, and the extra `{ error: string }`
 * branch still catches any bare error body that omits the `success` flag.
 */
type SuccessResponse<Resp> =
  Resp extends ClientResponse<unknown, number, string>
    ? Awaited<ReturnType<Resp['json']>> extends { success: false }
      ? never
      : Awaited<ReturnType<Resp['json']>> extends { error: string }
        ? never
        : Awaited<ReturnType<Resp['json']>>
    : never;

/**
 * Handles the response from the API.
 * If the response is not OK, it throws an error with the error message from the response.
 * Otherwise, it returns the JSON data from the response.
 *
 * @name handleHonoClientResponse
 * @param response - The response object from the fetch request.
 * @returns The JSON data from the response if successful.
 * @throws An error if the response is not OK.
 */
export async function handleHonoClientResponse<
  T,
  U extends number,
  F extends ResponseFormat,
  Resp extends ClientResponse<T, U, F>,
>(response: Resp): Promise<SuccessResponse<Resp>> {
  if (!response.ok) {
    // Extract error data without throwing inside try blocks
    // (throws inside try are caught by their own catch - a common JS gotcha)
    let errorMessage =
      'An error occurred. Please read the logs for more details.';
    let errorCode: string | undefined;
    let responseData: Record<string, unknown> | undefined;

    try {
      const data = (await response.clone().json()) as {
        error?: string;
        errorCode?: string;
        [key: string]: unknown;
      };
      if (data.error) {
        errorMessage = data.error;
      }
      errorCode = data.errorCode;
      responseData = data;
    } catch {
      // JSON parsing failed, try raw text
      try {
        const text = await response.clone().text();
        const asJson = JSON.parse(text) as {
          error?: string;
          errorCode?: string;
          [key: string]: unknown;
        };
        errorMessage = asJson.error || text;
        errorCode = asJson.errorCode;
        responseData = asJson;
      } catch {
        // Keep default error message
      }
    }

    throw new ApiError(errorMessage, {
      errorCode,
      status: response.status,
      data: responseData,
    });
  }

  return (await response.json()) as SuccessResponse<Resp>;
}
