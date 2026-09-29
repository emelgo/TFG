import { Hono } from 'hono';

import { createAuthorizationService } from '@pymekit/cms-auth/services';
import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { createAccountService } from '../services/account.service';

/**
 * Registra `GET /v1/account`: la cuenta del CMS del usuario de la sesión.
 *
 * Además de la fila de `cms.accounts` (preferencias y metadatos), devuelve
 * `access`, las secciones de la interfaz que el usuario puede usar
 * (`AuthorizationService.getSectionAccess`). Es la primera llamada que hace
 * la interfaz del CMS al cargar (`/admin/cms`): con una sola petición sabe si
 * el acceso es válido (si no, el *middleware* ya habría respondido 401/403) y
 * qué entradas mostrar en la barra lateral.
 *
 * [TFG] RF-09 · ADR-014.
 */
export function registerGetAccountRoute(router: Hono) {
  return router.get('/v1/account', async (c) => {
    const logger = await getLogger();
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
            error: 'Account not found',
          },
          404,
        );
      }

      return c.json({ account, access });
    } catch (error) {
      logger.error(
        {
          error,
        },
        'Error getting account',
      );

      return c.json(
        {
          error: getErrorMessage(error),
        },
        500,
      );
    }
  });
}

export type GetAccountRoute = ReturnType<typeof registerGetAccountRoute>;
