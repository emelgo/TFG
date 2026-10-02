import { zValidator } from '@hono/zod-validator';
import type { Hono } from 'hono';
import { z } from 'zod';

import { getLogger } from '@pymekit/shared/logger';

import {
  M2MLinkRequestSchema,
  createM2MService,
} from '../services/m2m.service';

/**
 * Regex for validating SQL identifiers (schema, table, column names).
 * Must start with letter or underscore, contain only alphanumeric and underscore.
 */
const SQL_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Schema for route path parameters with SQL identifier validation.
 * Prevents SQL injection via malformed schema/table names.
 */
const M2MParamsSchema = z.object({
  schema: z
    .string()
    .min(1)
    .regex(SQL_IDENTIFIER_REGEX, 'Invalid schema name format'),
  table: z
    .string()
    .min(1)
    .regex(SQL_IDENTIFIER_REGEX, 'Invalid table name format'),
});

/**
 * Register M2M link/unlink routes for many-to-many relationship management.
 *
 * Routes:
 * - POST /v1/data-explorer/:schema/:table/m2m/link - Create junction record
 * - POST /v1/data-explorer/:schema/:table/m2m/unlink - Delete junction record
 *
 * @param router - Hono router instance
 */
export function registerM2MRoutes(router: Hono) {
  registerM2MLinkRoute(router);
  registerM2MUnlinkRoute(router);
}

/**
 * POST /v1/data-explorer/:schema/:table/m2m/link
 *
 * Creates a record in the junction table to link source and target records.
 */
export function registerM2MLinkRoute(router: Hono) {
  return router.post(
    '/v1/data-explorer/:schema/:table/m2m/link',
    zValidator('param', M2MParamsSchema),
    zValidator('json', M2MLinkRequestSchema),
    async (c) => {
      const logger = await getLogger();
      const { schema, table } = c.req.valid('param');
      const body = c.req.valid('json');

      logger.info(
        {
          sourceTable: `${schema}.${table}`,
          junctionTable: `${body.relation.junctionSchema}.${body.relation.junctionTable}`,
          sourceId: body.sourceId,
          targetId: body.targetId,
        },
        'M2M link request received',
      );

      const service = createM2MService(c);
      const result = await service.linkRecord(body);

      if (!result.success) {
        // Map error codes to HTTP status codes
        const statusCode = getStatusCodeForError(result.errorCode);

        logger.warn(
          {
            sourceTable: `${schema}.${table}`,
            errorCode: result.errorCode,
            error: result.error,
          },
          'M2M link failed',
        );

        return c.json(
          {
            success: false,
            error: result.error,
            errorCode: result.errorCode,
            errorDetails: result.errorDetails,
          },
          statusCode,
        );
      }

      logger.info(
        {
          sourceTable: `${schema}.${table}`,
          junctionTable: `${body.relation.junctionSchema}.${body.relation.junctionTable}`,
        },
        'M2M link successful',
      );

      return c.json({
        success: true,
        data: result.data,
      });
    },
  );
}

/**
 * POST /v1/data-explorer/:schema/:table/m2m/unlink
 *
 * Deletes the junction table record to unlink source and target records.
 */
export function registerM2MUnlinkRoute(router: Hono) {
  return router.post(
    '/v1/data-explorer/:schema/:table/m2m/unlink',
    zValidator('param', M2MParamsSchema),
    zValidator('json', M2MLinkRequestSchema),
    async (c) => {
      const logger = await getLogger();
      const { schema, table } = c.req.valid('param');
      const body = c.req.valid('json');

      logger.info(
        {
          sourceTable: `${schema}.${table}`,
          junctionTable: `${body.relation.junctionSchema}.${body.relation.junctionTable}`,
          sourceId: body.sourceId,
          targetId: body.targetId,
        },
        'M2M unlink request received',
      );

      const service = createM2MService(c);
      const result = await service.unlinkRecord(body);

      if (!result.success) {
        // Map error codes to HTTP status codes
        const statusCode = getStatusCodeForError(result.errorCode);

        logger.warn(
          {
            sourceTable: `${schema}.${table}`,
            errorCode: result.errorCode,
            error: result.error,
          },
          'M2M unlink failed',
        );

        return c.json(
          {
            success: false,
            error: result.error,
            errorCode: result.errorCode,
            errorDetails: result.errorDetails,
          },
          statusCode,
        );
      }

      logger.info(
        {
          sourceTable: `${schema}.${table}`,
          junctionTable: `${body.relation.junctionSchema}.${body.relation.junctionTable}`,
        },
        'M2M unlink successful',
      );

      return c.json({
        success: true,
        data: result.data,
      });
    },
  );
}

/**
 * Map error codes to appropriate HTTP status codes
 */
function getStatusCodeForError(
  errorCode: string | undefined,
): 400 | 403 | 404 | 409 | 500 {
  switch (errorCode) {
    case 'PERMISSION_DENIED':
      return 403;
    case 'ALREADY_LINKED':
      return 409; // Conflict
    case 'NOT_FOUND':
      return 404;
    case 'FK_VIOLATION':
    case 'INVALID_RELATION':
    case 'COLUMNS_NOT_EDITABLE':
      return 400; // Bad request - invalid reference, relation config, or column settings
    default:
      return 500;
  }
}
