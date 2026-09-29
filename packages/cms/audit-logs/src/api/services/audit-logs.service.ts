import { and, desc, eq, gte, ilike, lt, lte, or, sql } from 'drizzle-orm';
import { Context } from 'hono';

import { getDrizzleSupabaseAdminClient } from '@pymekit/cms-supabase/client';
import { auditLogsInCms } from '@pymekit/cms-supabase/schema';

/**
 * Create audit logs service
 * @param context - The context
 * @returns The audit logs service
 */
export function createAuditLogsService(context: Context) {
  return new AuditLogsService(context);
}

/**
 * @name AuditLogsService
 * @description Service for audit logs
 */
class AuditLogsService {
  constructor(private readonly context: Context) {}

  /**
   * Get audit logs with cursor-based pagination
   * @param cursor - Optional cursor for pagination (encoded created_at and id)
   * @param limit - The number of logs per page
   * @param filters - Optional filters for search
   * @returns The audit logs with next cursor
   */
  async getAuditLogs({
    cursor,
    limit = 15,
    filters,
  }: {
    cursor?: string;
    limit?: number;
    filters?: {
      author?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
    };
  }) {
    const db = this.context.get('drizzle');

    // Build where conditions array
    const conditions = [];

    // Handle cursor-based pagination
    // Cursor format: base64(created_at|id)
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
        const [createdAt, id] = decoded.split('|');

        // Validate cursor parts exist
        if (createdAt && id) {
          // For DESC ordering: (created_at, id) < (cursor_created_at, cursor_id)
          // This ensures we get records older than the cursor position
          conditions.push(
            or(
              lt(auditLogsInCms.createdAt, createdAt),
              and(
                eq(auditLogsInCms.createdAt, createdAt),
                lt(auditLogsInCms.id, id),
              ),
            ),
          );
        }
      } catch (error) {
        // Invalid cursor - ignore and start from beginning
        console.error('Invalid cursor:', error);
      }
    }

    if (filters?.author) {
      const isFullUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          filters.author,
        );

      if (isFullUuid) {
        // Exact UUID match
        conditions.push(
          or(
            eq(auditLogsInCms.accountId, filters.author),
            eq(auditLogsInCms.userId, filters.author),
          ),
        );
      } else {
        // For partial matches, use parameterized SQL to cast UUID to text
        const searchPattern = `%${filters.author}%`;
        conditions.push(
          sql`(${auditLogsInCms.accountId}::text ILIKE ${searchPattern} OR ${auditLogsInCms.userId}::text ILIKE ${searchPattern})`,
        );
      }
    }

    if (filters?.action) {
      // Handle comma-separated actions or single action search
      const actions = filters.action.split(',').map((a) => a.trim());

      if (actions.length === 1) {
        // Single action - use partial matching
        conditions.push(ilike(auditLogsInCms.operation, `%${actions[0]}%`));
      } else {
        // Multiple actions - use exact matching with OR
        conditions.push(
          or(...actions.map((action) => eq(auditLogsInCms.operation, action))),
        );
      }
    }

    if (filters?.startDate) {
      conditions.push(gte(auditLogsInCms.createdAt, filters.startDate));
    }

    if (filters?.endDate) {
      // Add end of day for end date
      const endOfDay = new Date(filters.endDate);
      endOfDay.setHours(23, 59, 59, 999);
      conditions.push(lte(auditLogsInCms.createdAt, endOfDay.toISOString()));
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const data = await db.runTransaction(async (tx) => {
      // Fetch limit + 1 to determine if there are more results
      const logs = whereClause
        ? await tx
            .select()
            .from(auditLogsInCms)
            .where(whereClause)
            .orderBy(desc(auditLogsInCms.createdAt), desc(auditLogsInCms.id))
            .limit(limit + 1)
        : await tx
            .select()
            .from(auditLogsInCms)
            .orderBy(desc(auditLogsInCms.createdAt), desc(auditLogsInCms.id))
            .limit(limit + 1);

      return { logs };
    });

    // Check if there are more results
    const hasMore = data.logs.length > limit;
    const results = hasMore ? data.logs.slice(0, limit) : data.logs;

    // Generate next cursor from last item
    let nextCursor: string | null = null;
    if (hasMore && results.length > 0) {
      const lastItem = results[results.length - 1];
      if (lastItem) {
        const cursorData = `${lastItem.createdAt}|${lastItem.id}`;
        nextCursor = Buffer.from(cursorData).toString('base64');
      }
    }

    return {
      logs: results,
      nextCursor,
      hasMore,
      pageSize: limit,
    };
  }

  /**
   * Get audit logs by account id with cursor-based pagination
   * @param accountId - The account id
   * @param cursor - Optional cursor for pagination
   * @param limit - The number of logs per page
   * @returns The audit logs with next cursor
   */
  async getAuditLogsByAccountId({
    accountId,
    cursor,
    limit = 25,
  }: {
    accountId: string;
    cursor?: string;
    limit?: number;
  }) {
    const db = this.context.get('drizzle');

    // Build where conditions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conditions: any[] = [eq(auditLogsInCms.accountId, accountId)];

    // Handle cursor-based pagination
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
        const [createdAt, id] = decoded.split('|');

        if (createdAt && id) {
          const cursorCondition = or(
            lt(auditLogsInCms.createdAt, createdAt),
            and(
              eq(auditLogsInCms.createdAt, createdAt),
              lt(auditLogsInCms.id, id),
            ),
          );
          if (cursorCondition) {
            conditions.push(cursorCondition);
          }
        }
      } catch (error) {
        console.error('Invalid cursor:', error);
      }
    }

    const whereClause = and(...conditions);

    const data = await db.runTransaction(async (tx) => {
      // Fetch limit + 1 to determine if there are more results
      const logs = await tx
        .select()
        .from(auditLogsInCms)
        .where(whereClause)
        .orderBy(desc(auditLogsInCms.createdAt), desc(auditLogsInCms.id))
        .limit(limit + 1);

      return { logs };
    });

    // Check if there are more results
    const hasMore = data.logs.length > limit;
    const results = hasMore ? data.logs.slice(0, limit) : data.logs;

    // Generate next cursor from last item
    let nextCursor: string | null = null;
    if (hasMore && results.length > 0) {
      const lastItem = results[results.length - 1];
      if (lastItem) {
        const cursorData = `${lastItem.createdAt}|${lastItem.id}`;
        nextCursor = Buffer.from(cursorData).toString('base64');
      }
    }

    return {
      logs: results,
      nextCursor,
      hasMore,
      pageSize: limit,
    };
  }

  /**
   * Get audit log details
   * @param id - The audit log id
   * @returns The audit log details
   */
  async getAuditLogDetails({ id }: { id: string }) {
    const db = this.context.get('drizzle');
    const adminClient = getDrizzleSupabaseAdminClient();

    return await db.runTransaction(async (tx) => {
      const log = await tx
        .select()
        .from(auditLogsInCms)
        .where(eq(auditLogsInCms.id, id))
        .then((data) => data[0]);

      if (!log) {
        throw new Error('User not found');
      }

      const userData = log.userId
        ? await adminClient.execute(
            sql`SELECT email, id FROM auth.users WHERE id = ${log.userId}`,
          )
        : null;

      const user = userData
        ? (userData[0] as {
            email: string;
            id: string;
          })
        : null;

      return {
        log,
        user: user
          ? {
              email: user.email,
              id: user.id,
            }
          : null,
      };
    });
  }
}
