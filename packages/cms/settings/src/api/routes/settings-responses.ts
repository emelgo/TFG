/**
 * Respuestas de error comunes de las rutas de ajustes del CMS (F2.7a).
 *
 * Traduce cualquier error a `{ success: false, error, errorCode }` con el
 * estado de `classifySettingsError` y deja el detalle solo en el *log*:
 * nunca se devuelve el texto de PostgreSQL ni de Auth al cliente.
 *
 * [TFG] RNF-02 (bitácora B-20).
 */
import type { Context } from 'hono';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import { getLogger } from '@pymekit/shared/logger';

import { classifySettingsError } from '../utils/settings-errors';

/** Responde a un error con su código estable; el original va al *log*. */
export async function respondWithSettingsError(
  c: Context,
  error: unknown,
  params: {
    fallback: 'SETTINGS_ACTION_FAILED' | 'MEMBER_ACTION_FAILED';
    logContext: Record<string, unknown>;
  },
) {
  const logger = await getLogger();
  const { status, errorCode, message } = classifySettingsError(
    error,
    params.fallback,
  );

  if (status >= 500) {
    logger.error({ error, ...params.logContext }, 'Settings request failed');
  } else {
    logger.warn({ error, ...params.logContext }, 'Settings request rejected');
  }

  return c.json({ success: false as const, error: message, errorCode }, status);
}

/**
 * *Hook* de `zValidator`: 400 con código estable cuando la entrada no es
 * válida (en lugar del volcado de errores de Zod por defecto).
 */
export function invalidSettingsInput(code: 'SETTINGS' | 'MEMBER') {
  return (result: { success: boolean }, c: Context) => {
    if (!result.success) {
      return c.json(
        {
          success: false as const,
          error: 'The request is not valid',
          errorCode:
            code === 'SETTINGS'
              ? CMS_API_ERROR_CODES.SETTINGS_INVALID_DATA
              : CMS_API_ERROR_CODES.MEMBER_INVALID_DATA,
        },
        400,
      );
    }
  };
}
