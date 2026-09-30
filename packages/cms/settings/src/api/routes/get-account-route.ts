import type { Hono } from 'hono';

import { createAuthorizationService } from '@pymekit/cms-auth/services';
import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

import { createAccountService } from '../services/account.service';
import { respondWithSettingsError } from './settings-responses';

/**
 * Registra `GET /v1/account`: la cuenta del CMS del usuario de la sesión.
 *
 * Además de la fila de `cms.accounts` (preferencias y metadatos), devuelve
 * `access`, las secciones de la interfaz que el usuario puede usar
 * (`AuthorizationService.getSectionAccess`), incluidas desde F2.7a las
 * pestañas de Ajustes con permiso propio (`members`, `systemSettings`). Es
 * la primera llamada que hace la interfaz del CMS al cargar (`/admin/cms`):
 * con una sola petición sabe si el acceso es válido (si no, el *middleware*
 * ya habría respondido 401/403) y qué entradas mostrar.
 *
 * Los errores se responden con un código estable, sin el texto interno
 * (F2.7a; antes devolvía `getErrorMessage(error)`).
 *
 * [TFG] RF-09 · ADR-014.
 */
export function registerGetAccountRoute(router: Hono) {
  return router.get('/v1/account', async (c) => {
    const service = createAccountService(c);
    const authorization = createAuthorizationService(c);

    try {
      const [account, access] = await Promise.all([
        service.getAccount(),
        authorization.getSectionAccess(),
      ]);

      if (!account) {
        return c.json(
          {
            success: false as const,
            error: 'Account not found',
            errorCode: CMS_API_ERROR_CODES.SETTINGS_PERMISSION_DENIED,
          },
          404,
        );
      }

      return c.json({ account, access });
    } catch (error) {
      return respondWithSettingsError(c, error, {
        fallback: 'SETTINGS_ACTION_FAILED',
        logContext: { route: 'account' },
      });
    }
  });
}

export type GetAccountRoute = ReturnType<typeof registerGetAccountRoute>;
