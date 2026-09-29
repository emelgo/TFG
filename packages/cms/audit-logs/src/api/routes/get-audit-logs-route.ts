import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { createAuditLogsService } from '../services/audit-logs.service';

/**
 * Register the audit logs route
 */
export function registerAuditLogsRoute(router: Hono) {
  return router.get(
    '/v1/audit-logs',
    zValidator(
      'query',
      z.object({
        cursor: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).optional(),
        author: z
          .string()
          .min(1)
          .max(36, 'Author must be a valid UUID or a non-empty string')
          .optional()
          .transform((val) => val?.trim()),
        action: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
    ),
    async (c) => {
      const logger = await getLogger();

      const { cursor, limit, author, action, startDate, endDate } =
        c.req.valid('query');

      const service = createAuditLogsService(c);

      try {
        const data = await service.getAuditLogs({
          cursor,
          limit,
          filters: {
            author,
            action,
            startDate,
            endDate,
          },
        });

        return c.json(data);
      } catch (error) {
        logger.error(
          {
            error,
          },
          'Error fetching audit logs',
        );

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

export type GetAuditLogsRoute = ReturnType<typeof registerAuditLogsRoute>;

/**
 * Register the audit log details route
 */
export function registerAuditLogDetailsRoute(router: Hono) {
  return router.get(
    '/v1/audit-logs/:id',
    zValidator('param', z.object({ id: z.uuid() })),
    async (c) => {
      const { id } = c.req.valid('param');
      const logger = await getLogger();
      const service = createAuditLogsService(c);

      try {
        const data = await service.getAuditLogDetails({
          id,
        });

        return c.json(data);
      } catch (error) {
        logger.error(
          {
            id,
            error,
          },
          'Error fetching audit log details',
        );

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

export type GetAuditLogDetailsRoute = ReturnType<
  typeof registerAuditLogDetailsRoute
>;

/**
 * Register the audit logs route
 */
export function registerMemberAuditLogsRoute(router: Hono) {
  return router.get(
    '/v1/audit-logs/member/:id',
    zValidator('param', z.object({ id: z.uuid() })),
    zValidator(
      'query',
      z.object({
        cursor: z.string().optional(),
        limit: z.coerce.number().min(1).max(50).optional(),
      }),
    ),
    async (c) => {
      const logger = await getLogger();
      const { id } = c.req.valid('param');
      const { cursor, limit } = c.req.valid('query');
      const service = createAuditLogsService(c);

      try {
        const data = await service.getAuditLogsByAccountId({
          accountId: id,
          cursor,
          limit,
        });

        return c.json(data);
      } catch (error) {
        logger.error(
          {
            id,
            error,
          },
          'Error fetching audit logs by account id',
        );

        return c.json(
          {
            error: getErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

export type GetMemberAuditLogsRoute = ReturnType<
  typeof registerMemberAuditLogsRoute
>;
