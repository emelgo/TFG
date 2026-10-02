/**
 * Rutas Hono del registro de auditoría del CMS (solo lectura).
 *
 *  - `GET /v1/audit-logs`: página del registro con filtros (autor,
 *    operaciones, esquema, tabla, gravedad y rango de días UTC) y cursor.
 *  - `GET /v1/audit-logs/:id`: una entrada con el correo de su autor.
 *  - `GET /v1/audit-logs/member/:id`: entradas de una cuenta del CMS (el
 *    registro de un miembro, que usará la pantalla de miembros).
 *
 * No existe ninguna ruta para crear, cambiar ni borrar entradas: las
 * escriben solo las funciones del sistema en la base de datos (ver
 * `47-cms-audit-logs.sql`).
 *
 * La autorización la decide `AuditLogsService` (permiso `log:select`,
 * jerarquía de rangos con RLS y redacción de los datos de tablas no
 * legibles). Los errores se responden con un código estable (`AUDIT_LOG_*`)
 * y un mensaje genérico; el detalle solo va al *log*.
 *
 * [TFG] RF-10 · RNF-02.
 */
import { zValidator } from '@hono/zod-validator';
import type { Context, Hono } from 'hono';
import * as z from 'zod';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import { getLogger } from '@pymekit/shared/logger';

import { createAuditLogsService } from '../services/audit-logs.service';
import { classifyAuditLogsError } from '../utils/audit-logs-errors';
import {
  AuditLogsQuerySchema,
  MemberAuditLogsQuerySchema,
} from '../utils/audit-logs-query';

const IdParamsSchema = z.object({ id: z.string().uuid() });

/** 400 con código estable cuando un parámetro no es válido. */
function invalidAuditLogsInput(result: { success: boolean }, c: Context) {
  if (!result.success) {
    return c.json(
      {
        success: false as const,
        error: 'The audit log filters are not valid',
        errorCode: CMS_API_ERROR_CODES.AUDIT_LOG_INVALID_FILTER,
      },
      400,
    );
  }
}

/** Responde a un error con su código estable; el original va al *log*. */
async function respondWithAuditLogsError(
  c: Context,
  error: unknown,
  logContext: Record<string, unknown>,
) {
  const logger = await getLogger();
  const { status, errorCode, message } = classifyAuditLogsError(error);

  if (status >= 500) {
    logger.error({ error, ...logContext }, 'Error reading audit logs');
  } else {
    logger.warn({ error, ...logContext }, 'Audit logs request rejected');
  }

  return c.json({ success: false as const, error: message, errorCode }, status);
}

/** Registra `GET /v1/audit-logs`. */
export function registerAuditLogsRoute(router: Hono) {
  return router.get(
    '/v1/audit-logs',
    zValidator('query', AuditLogsQuerySchema, invalidAuditLogsInput),
    async (c) => {
      const { cursor, limit, ...filters } = c.req.valid('query');

      try {
        const data = await createAuditLogsService(c).getAuditLogs({
          cursor,
          limit,
          filters,
        });

        return c.json(data);
      } catch (error) {
        return respondWithAuditLogsError(c, error, { route: 'list' });
      }
    },
  );
}

export type GetAuditLogsRoute = ReturnType<typeof registerAuditLogsRoute>;

/** Registra `GET /v1/audit-logs/:id`. */
export function registerAuditLogDetailsRoute(router: Hono) {
  return router.get(
    '/v1/audit-logs/:id',
    zValidator('param', IdParamsSchema, invalidAuditLogsInput),
    async (c) => {
      const { id } = c.req.valid('param');

      try {
        const data = await createAuditLogsService(c).getAuditLogDetails({
          id,
        });

        return c.json(data);
      } catch (error) {
        return respondWithAuditLogsError(c, error, { route: 'details', id });
      }
    },
  );
}

export type GetAuditLogDetailsRoute = ReturnType<
  typeof registerAuditLogDetailsRoute
>;

/** Registra `GET /v1/audit-logs/member/:id` (id de la cuenta del CMS). */
export function registerMemberAuditLogsRoute(router: Hono) {
  return router.get(
    '/v1/audit-logs/member/:id',
    zValidator('param', IdParamsSchema, invalidAuditLogsInput),
    zValidator('query', MemberAuditLogsQuerySchema, invalidAuditLogsInput),
    async (c) => {
      const { id } = c.req.valid('param');
      const { cursor, limit } = c.req.valid('query');

      try {
        const data = await createAuditLogsService(c).getAuditLogsByAccountId({
          accountId: id,
          cursor,
          limit,
        });

        return c.json(data);
      } catch (error) {
        return respondWithAuditLogsError(c, error, { route: 'member', id });
      }
    },
  );
}

export type GetMemberAuditLogsRoute = ReturnType<
  typeof registerMemberAuditLogsRoute
>;
