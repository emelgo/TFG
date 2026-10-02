/**
 * Comprobaciones de acceso de los paneles y de las tablas de sus *widgets*
 * (F2.8).
 *
 * La base de datos ya es la autoridad (políticas RLS de `cms.dashboards` y
 * `cms.dashboard_widgets`, `cms.can_access_dashboard`/`can_edit_dashboard`),
 * pero sin estas comprobaciones previas la API no sabría *por qué* falla una
 * escritura: RLS hace que un UPDATE/DELETE sin permiso afecte a 0 filas y la
 * ruta heredada respondía «no encontrado». Aquí se pregunta antes y se
 * responde con el código exacto (404 si no puede ni verlo, 403 si puede
 * verlo pero no editarlo).
 *
 * Seguridad de los datos de los *widgets* (RF-11):
 *  - **Al leer**, cada petición de datos comprueba `cms.has_data_permission`
 *    para quien MIRA el panel, no para quien lo creó: un panel compartido con
 *    un rol inferior no filtra datos de tablas que ese rol no puede leer
 *    (esos *widgets* responden `DASHBOARD_WIDGET_NO_ACCESS`).
 *  - **Al guardar**, la tabla debe estar gestionada por el CMS, no ser de un
 *    esquema protegido, ser legible por quien edita y todas las columnas de
 *    la configuración deben existir en su metadato.
 *
 * [TFG] RF-11 · RNF-02 · ADR-013.
 */
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';

import { createAuthorizationService } from '@pymekit/cms-auth/services';
import {
  createTableMetadataService,
  isProtectedSchema,
} from '@pymekit/cms-data-explorer-core';
import {
  type WidgetDefinition,
  collectWidgetColumns,
} from '@pymekit/cms-shared/dashboards';
import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

import { DashboardError } from '../dashboard-errors';

/** Lo que el usuario actual puede hacer con un panel. */
export type DashboardAccess = {
  canAccess: boolean;
  canEdit: boolean;
  /** Propietario (o panel huérfano que puede editar): borrar y compartir. */
  canManage: boolean;
};

/** Consulta en una sola ida a la base de datos el acceso a un panel. */
export async function getDashboardAccess(
  context: Context,
  dashboardId: string,
): Promise<DashboardAccess> {
  const db = context.get('drizzle');

  const rows = await db.runTransaction((tx) =>
    tx.execute(sql`
      SELECT
        cms.can_access_dashboard(${dashboardId}::uuid) AS can_access,
        cms.can_edit_dashboard(${dashboardId}::uuid) AS can_edit,
        EXISTS (
          SELECT 1 FROM cms.dashboards d
          WHERE d.id = ${dashboardId}::uuid
            AND (
              d.created_by = cms.get_current_user_account_id()
              OR (d.created_by IS NULL AND cms.can_edit_dashboard(d.id))
            )
        ) AS can_manage
    `),
  );

  const row = rows[0] ?? {};

  return {
    canAccess: row['can_access'] === true,
    canEdit: row['can_edit'] === true,
    canManage: row['can_manage'] === true,
  };
}

/** Lanza 404 si no puede ver el panel y 403 si no puede editarlo. */
export async function assertCanEditDashboard(
  context: Context,
  dashboardId: string,
) {
  const access = await getDashboardAccess(context, dashboardId);

  if (!access.canAccess) {
    throw new DashboardError(CMS_API_ERROR_CODES.DASHBOARD_NOT_FOUND);
  }

  if (!access.canEdit) {
    throw new DashboardError(CMS_API_ERROR_CODES.DASHBOARD_FORBIDDEN);
  }

  return access;
}

/** Lanza 404 si no puede ver el panel y 403 si no es su propietario. */
export async function assertCanManageDashboard(
  context: Context,
  dashboardId: string,
) {
  const access = await getDashboardAccess(context, dashboardId);

  if (!access.canAccess) {
    throw new DashboardError(CMS_API_ERROR_CODES.DASHBOARD_NOT_FOUND);
  }

  if (!access.canManage) {
    throw new DashboardError(CMS_API_ERROR_CODES.DASHBOARD_FORBIDDEN);
  }

  return access;
}

/**
 * ¿Puede el usuario ACTUAL leer la tabla? Esquemas protegidos nunca; el
 * resto, según `cms.has_data_permission('select', …)` (vía
 * `AuthorizationService`).
 */
export async function canReadWidgetTable(
  context: Context,
  schemaName: string,
  tableName: string,
) {
  if (isProtectedSchema(schemaName)) {
    return false;
  }

  const permissions = await createAuthorizationService(
    context,
  ).getTableCRUDPermissions(schemaName, tableName);

  return permissions.canSelect === true;
}

/**
 * Valida el origen de un *widget* antes de guardarlo: esquema no protegido,
 * tabla legible por quien edita, gestionada por el CMS y columnas existentes.
 */
export async function assertValidWidgetSource(
  context: Context,
  definition: WidgetDefinition,
) {
  if (isProtectedSchema(definition.schemaName)) {
    throw new DashboardError(
      CMS_API_ERROR_CODES.DASHBOARD_WIDGET_INVALID_SOURCE,
    );
  }

  if (
    !(await canReadWidgetTable(
      context,
      definition.schemaName,
      definition.tableName,
    ))
  ) {
    throw new DashboardError(CMS_API_ERROR_CODES.DASHBOARD_WIDGET_NO_ACCESS);
  }

  let columnNames: Set<string>;

  try {
    // El permiso ya se ha comprobado: el servicio de metadatos usa el
    // cliente administrador solo para leer la definición de la tabla.
    const metadata = await createTableMetadataService().getTableMetadata({
      schemaName: definition.schemaName,
      tableName: definition.tableName,
    });

    columnNames = new Set(metadata.columns.map((column) => column.name));
  } catch {
    // Tabla no gestionada por el CMS (`Table not found`).
    throw new DashboardError(
      CMS_API_ERROR_CODES.DASHBOARD_WIDGET_INVALID_SOURCE,
    );
  }

  const unknownColumns = collectWidgetColumns(definition).filter(
    (column) => !columnNames.has(column),
  );

  if (unknownColumns.length > 0) {
    throw new DashboardError(
      CMS_API_ERROR_CODES.DASHBOARD_WIDGET_INVALID_SOURCE,
    );
  }
}
