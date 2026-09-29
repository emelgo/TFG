import { eq, sql } from 'drizzle-orm';
import { Context } from 'hono';

import { dashboardsInCms } from '@pymekit/cms-supabase/schema';
import { getLogger } from '@pymekit/shared/logger';

import type { DashboardWithStats } from '../../types';
import type { CreateDashboardType, UpdateDashboardType } from '../schemas';

// Re-export schemas for convenience
export {
  CreateDashboardSchema,
  ShareDashboardSchema,
  UpdateDashboardSchema,
} from '../schemas';
export type {
  CreateDashboardType,
  ShareDashboardType,
  UpdateDashboardType,
} from '../schemas';

/**
 * Create a dashboards service
 */
export function createDashboardsService(context: Context) {
  return new DashboardsService(context);
}

/**
 * Service class for managing dashboards
 */
class DashboardsService {
  constructor(private readonly context: Context) {}

  /**
   * Get all dashboards for the current user with stats
   */
  async getDashboards(
    page: number = 1,
    pageSize: number = 20,
    search?: string,
    filter: 'all' | 'owned' | 'shared' = 'all',
  ): Promise<{
    dashboards: DashboardWithStats[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
    };
  }> {
    const db = this.context.get('drizzle');

    const result = await db.runTransaction(async (tx) => {
      // Use the new database function
      const functionResult = await tx.execute(
        sql`SELECT cms.list_dashboards(${page}, ${pageSize}, ${search || null}, ${filter})`,
      );

      const data = functionResult[0]?.['list_dashboards'];

      if (!data) {
        return {
          dashboards: [],
          pagination: { page: 1, pageSize, total: 0 },
        };
      }

      return {
        dashboards:
          ((data as Record<string, unknown>)[
            'dashboards'
          ] as DashboardWithStats[]) || [],
        pagination: ((data as Record<string, unknown>)['pagination'] as {
          page: number;
          pageSize: number;
          total: number;
        }) || { page: 1, pageSize, total: 0 },
      };
    });

    return result;
  }

  /**
   * Get a specific dashboard by ID with widgets and permissions
   */
  async getDashboard(id: string): Promise<{
    dashboard: Record<string, unknown>;
    widgets: Record<string, unknown>[];
    canEdit: boolean;
  } | null> {
    const logger = await getLogger();
    const db = this.context.get('drizzle');

    return db.runTransaction(async (tx) => {
      try {
        const result = await tx.execute(sql`SELECT cms.get_dashboard(${id})`);

        const data = result[0]?.['get_dashboard'];

        if (!data) {
          return null;
        }

        return {
          dashboard: (data as Record<string, unknown>)['dashboard'] as Record<
            string,
            unknown
          >,
          widgets:
            ((data as Record<string, unknown>)['widgets'] as Record<
              string,
              unknown
            >[]) || [],
          canEdit:
            ((data as Record<string, unknown>)['can_edit'] as boolean) || false,
        };
      } catch (error) {
        logger.error({ error }, 'Failed to get dashboard');

        return null;
      }
    });
  }

  /**
   * Create a new dashboard
   */
  async createDashboard(data: CreateDashboardType) {
    const db = this.context.get('drizzle');

    const result = await db.runTransaction(async (tx) => {
      // Only pass role shares if the array has items, otherwise pass null
      const roleSharesJson =
        data.roleShares && data.roleShares.length > 0
          ? JSON.stringify(data.roleShares)
          : null;

      const functionResult = await tx.execute(
        sql`SELECT cms.create_dashboard(${data.name}, ${roleSharesJson}::jsonb)`,
      );

      return functionResult[0]?.['create_dashboard'];
    });

    if (!result) {
      throw new Error('Failed to create dashboard');
    }

    return result;
  }

  /**
   * Update an existing dashboard
   */
  async updateDashboard(id: string, data: UpdateDashboardType) {
    const db = this.context.get('drizzle');

    const result = await db.runTransaction(async (tx) => {
      return tx
        .update(dashboardsInCms)
        .set({
          name: data.name,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(dashboardsInCms.id, id))
        .returning();
    });

    if (!result[0]) {
      throw new Error('Dashboard not found');
    }

    return result[0];
  }

  /**
   * Delete a dashboard
   */
  async deleteDashboard(id: string) {
    const db = this.context.get('drizzle');

    await db.runTransaction(async (tx) => {
      const result = await tx
        .delete(dashboardsInCms)
        .where(eq(dashboardsInCms.id, id))
        .returning();

      if (!result[0]) {
        throw new Error('Dashboard not found');
      }
    });
  }

  /**
   * Share dashboard with a role
   */
  async shareDashboardWithRole(
    dashboardId: string,
    roleId: string,
    permissionLevel: 'view' | 'edit' = 'view',
  ): Promise<{ success: boolean }> {
    const db = this.context.get('drizzle');

    const result = await db.runTransaction(async (tx) => {
      const functionResult = await tx.execute(
        sql`SELECT cms.share_dashboard_with_role(${dashboardId}, ${roleId}, ${permissionLevel})`,
      );

      return functionResult[0]?.['share_dashboard_with_role'];
    });

    return (result as { success: boolean }) || { success: false };
  }

  /**
   * Unshare dashboard from a role
   */
  async unshareDashboardFromRole(
    dashboardId: string,
    roleId: string,
  ): Promise<{ success: boolean }> {
    const db = this.context.get('drizzle');

    const result = await db.runTransaction(async (tx) => {
      const functionResult = await tx.execute(
        sql`SELECT cms.unshare_dashboard_from_role(${dashboardId}, ${roleId})`,
      );

      return functionResult[0]?.['unshare_dashboard_from_role'];
    });

    return (result as { success: boolean }) || { success: false };
  }
}
