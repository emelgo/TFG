import { eq, sql } from 'drizzle-orm';
import { Context } from 'hono';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import {
  dashboardRoleSharesInCms,
  dashboardsInCms,
} from '@pymekit/cms-supabase/schema';

import { DashboardError } from '../dashboard-errors';
import type { CreateDashboardType, UpdateDashboardType } from '../schemas';
import {
  assertCanEditDashboard,
  assertCanManageDashboard,
  getDashboardAccess,
} from './dashboard-access';

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
  ) {
    const db = this.context.get('drizzle');

    const data = await db.runTransaction(async (tx) => {
      const functionResult = await tx.execute(
        sql`SELECT cms.list_dashboards(${page}, ${pageSize}, ${search || null}, ${filter})`,
      );

      return functionResult[0]?.['list_dashboards'] as
        | { dashboards?: Array<Record<string, unknown>> | null }
        | undefined;
    });

    // `cms.list_dashboards` devuelve filas en snake_case (`row_to_json`);
    // se traducen a un tipo explícito para el cliente RPC. El total que
    // calcula la función no es fiable (ventana sobre la fila agregada), así
    // que la interfaz pagina con «hay más si la página está llena».
    const dashboards = (data?.dashboards ?? []).map((row) => ({
      id: String(row['id']),
      name: String(row['name']),
      widgetCount: Number(row['widget_count'] ?? 0),
      isOwner: row['is_owner'] === true,
      permissionLevel: String(row['permission_level'] ?? 'view') as
        | 'owner'
        | 'view'
        | 'edit',
      updatedAt: String(row['updated_at'] ?? ''),
    }));

    return { dashboards, page, pageSize };
  }

  /**
   * Un panel con sus *widgets* y lo que el usuario puede hacer con él.
   *
   * `cms.get_dashboard` comprueba el acceso (lanza sin él → `null`, 404).
   * Las comparticiones solo las ve el propietario (la política
   * `manage_shares` filtra el resto), así que para los demás es `[]`.
   */
  async getDashboard(id: string) {
    const db = this.context.get('drizzle');
    const access = await getDashboardAccess(this.context, id);

    if (!access.canAccess) {
      return null;
    }

    return db.runTransaction(async (tx) => {
      const result = await tx.execute(sql`SELECT cms.get_dashboard(${id})`);
      const data = result[0]?.['get_dashboard'] as
        | Record<string, unknown>
        | undefined;

      if (!data) {
        return null;
      }

      const shares = await tx
        .select({
          roleId: dashboardRoleSharesInCms.roleId,
          permissionLevel: dashboardRoleSharesInCms.permissionLevel,
        })
        .from(dashboardRoleSharesInCms)
        .where(eq(dashboardRoleSharesInCms.dashboardId, id));

      const dashboard = data['dashboard'] as Record<string, unknown>;
      const widgets =
        (data['widgets'] as Array<Record<string, unknown>> | null) ?? [];

      // Filas en snake_case (`row_to_json`) → tipo explícito para el cliente.
      return {
        dashboard: {
          id: String(dashboard['id']),
          name: String(dashboard['name']),
        },
        widgets: widgets.map((widget) => ({
          id: String(widget['id']),
          widgetType: widget['widget_type'] as 'metric' | 'chart' | 'table',
          title: String(widget['title']),
          schemaName: String(widget['schema_name']),
          tableName: String(widget['table_name']),
          config: (widget['config'] ?? {}) as Record<string, unknown>,
          position: (widget['position'] ?? {}) as Record<string, unknown>,
        })),
        canEdit: data['can_edit'] === true,
        canManage: access.canManage,
        shares: access.canManage ? shares : [],
      };
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

    await assertCanEditDashboard(this.context, id);

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
      throw new DashboardError(CMS_API_ERROR_CODES.DASHBOARD_NOT_FOUND);
    }

    return result[0];
  }

  /** Borra un panel: solo su propietario (403 si solo puede verlo/editarlo). */
  async deleteDashboard(id: string) {
    const db = this.context.get('drizzle');

    await assertCanManageDashboard(this.context, id);

    await db.runTransaction(async (tx) => {
      const result = await tx
        .delete(dashboardsInCms)
        .where(eq(dashboardsInCms.id, id))
        .returning();

      if (!result[0]) {
        throw new DashboardError(CMS_API_ERROR_CODES.DASHBOARD_NOT_FOUND);
      }
    });
  }

  /**
   * Comparte el panel con un rol. Solo el propietario y solo con roles de
   * rango estrictamente inferior al suyo: se comprueba antes para responder
   * con un código claro; `cms.share_dashboard_with_role` y la política
   * `manage_shares` lo vuelven a imponer en la base de datos.
   */
  async shareDashboardWithRole(
    dashboardId: string,
    roleId: string,
    permissionLevel: 'view' | 'edit' = 'view',
  ) {
    const db = this.context.get('drizzle');

    await assertCanManageDashboard(this.context, dashboardId);

    return db.runTransaction(async (tx) => {
      const rank = await tx.execute(sql`
        SELECT COALESCE(
          (SELECT r.rank FROM cms.roles r WHERE r.id = ${roleId}::uuid)
            < cms.get_user_max_role_rank(cms.get_current_user_account_id()),
          false
        ) AS allowed
      `);

      if (rank[0]?.['allowed'] !== true) {
        throw new DashboardError(
          CMS_API_ERROR_CODES.DASHBOARD_SHARE_RANK_DENIED,
        );
      }

      const result = await tx.execute(
        sql`SELECT cms.share_dashboard_with_role(${dashboardId}, ${roleId}, ${permissionLevel})`,
      );

      return result[0]?.['share_dashboard_with_role'] as Record<
        string,
        unknown
      >;
    });
  }

  /** Deja de compartir el panel con un rol (solo el propietario). */
  async unshareDashboardFromRole(dashboardId: string, roleId: string) {
    const db = this.context.get('drizzle');

    await assertCanManageDashboard(this.context, dashboardId);

    await db.runTransaction(async (tx) => {
      await tx.execute(
        sql`SELECT cms.unshare_dashboard_from_role(${dashboardId}, ${roleId})`,
      );
    });

    return { success: true };
  }
}
