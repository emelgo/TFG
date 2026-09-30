import { createClient } from '@supabase/supabase-js';

/**
 * Pruebas E2E del registro de auditoría del CMS (F2.6).
 *
 * Con el super-admin (raíz del CMS, sesión con MFA):
 *  - edita en el explorador de datos una notificación que crea la prueba,
 *    encuentra la entrada `UPDATE` en el listado con los filtros (operación,
 *    tabla, autor y día) y abre su ficha con la comparación campo a campo.
 *
 * Con el personal de soporte (rol «Soporte», rango 30, con `log:select`):
 *  - ve la sección y sus propias entradas;
 *  - no ve ninguna entrada del super-admin (Root, rango 100): ni en el
 *    listado, ni por id (404 con `AUDIT_LOG_NOT_FOUND`), ni en el registro de
 *    su cuenta (403 con `AUDIT_LOG_PERMISSION_DENIED`);
 *  - la API no tiene rutas para crear ni borrar entradas y rechaza filtros no
 *    válidos con un código estable.
 *
 * Cada ejecución marca sus notificaciones con un texto único y `afterAll`
 * las borra con la clave de servicio.
 *
 * [TFG] RF-10 · RNF-02 · ADR-014.
 */
import { type Browser, expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { AuditLogsPageObject } from './audit-logs.po';
import { CmsPageObject } from './cms.po';
import { RecordFormPageObject } from './record-form.po';
import { RecordPageObject } from './record.po';

/** Usuarios y cuentas del *seed*. */
const SEED = {
  superAdminUserId: 'c5b930c9-0a76-412e-a836-4bc4849a3270',
  superAdminEmail: 'super-admin@makerkit.dev',
  cmsStaffAccountId: '6a0f3e2d-1c4b-4a59-8e7d-3b2c1a0f9e8d',
  teamAccountId: '5deaa894-2094-4da3-b4fd-1fada0809d1c',
} as const;

/** Cabecera `Origin` de la web (la que envía el navegador). */
const SAME_ORIGIN = { origin: 'http://localhost:3100' };

const RUN_ID = `E2E-CMS-AUDIT-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;

const NOTIFICATIONS_PATH = 'public/notifications';

type AuditLogsResponse = {
  logs: Array<{
    id: string;
    accountId: string | null;
    userId: string | null;
    operation: string;
    tableName: string;
    recordId: string | null;
  }>;
};

/** Cliente con la clave de servicio del Supabase local (ignora RLS). */
function getAdminClient() {
  return createClient(
    'http://127.0.0.1:54321',
    'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz',
  );
}

/** Crea una notificación de prueba y devuelve su id. */
async function seedNotification(body: string) {
  const { data, error } = await getAdminClient()
    .from('notifications')
    .insert({ account_id: SEED.teamAccountId, body })
    .select('id')
    .single();

  if (error) {
    throw new Error(`No se pudo crear la notificación: ${error.message}`);
  }

  return String(data.id);
}

/** Día UTC de hoy (`AAAA-MM-DD`), el formato de los filtros de fecha. */
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Con una sesión de super-admin, modifica una notificación por la API del
 * CMS y devuelve el id de la entrada `UPDATE` que deja en la auditoría, junto
 * con el id de la cuenta del CMS del super-admin.
 */
async function createSuperAdminAuditLog(browser: Browser) {
  const context = await browser.newContext({
    storageState: AUTH_STATES.SUPER_ADMIN,
  });

  try {
    const page = await context.newPage();
    const id = await seedNotification(`${RUN_ID}-root`);

    await page.goto('/admin/cms');

    const account = (await (
      await page.request.get('/api/cms/v1/account')
    ).json()) as { account: { id: string } };

    const update = await page.request.put(
      `/api/cms/v1/tables/${NOTIFICATIONS_PATH}/record/conditions`,
      { data: { conditions: { id }, data: { dismissed: true } } },
    );

    expect(update.status()).toBe(200);

    let logId = '';

    await expect
      .poll(async () => {
        const response = await page.request.get(
          `/api/cms/v1/audit-logs?action=UPDATE&table=notifications&author=${SEED.superAdminUserId}&limit=100`,
        );
        const body = (await response.json()) as AuditLogsResponse;

        logId = body.logs.find((log) => log.recordId === id)?.id ?? '';

        return logId;
      })
      .not.toBe('');

    return { logId, rootAccountId: account.account.id };
  } finally {
    await context.close();
  }
}

test.afterAll(async () => {
  await getAdminClient()
    .from('notifications')
    .delete()
    .like('body', `${RUN_ID}%`);
});

test.describe('Registro de auditoría: super-admin con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('edita un registro, encuentra su entrada con filtros y ve la comparación', async ({
    page,
  }) => {
    const record = new RecordPageObject(page);
    const form = new RecordFormPageObject(page);
    const auditLogs = new AuditLogsPageObject(page);
    const id = await seedNotification(`${RUN_ID}-edit`);

    // 1. Acción en el explorador de datos: marcar la notificación como vista.
    await record.goto(`${NOTIFICATIONS_PATH}/record/${id}`);
    await record.waitForHydration();
    await form.editButton().click();
    await page.waitForURL(`**/${NOTIFICATIONS_PATH}/record/${id}/edit`);
    await form.waitForForm();
    await form.toggleSwitch('dismissed');
    await form.submit().click();
    await page.waitForURL(`**/${NOTIFICATIONS_PATH}/record/${id}`);
    await expect(record.fieldValue('dismissed')).toContainText('Yes');

    // 2. Listado con filtros: operación, tabla, autor y día de hoy.
    await auditLogs.goto();
    await auditLogs.applyFilters({
      author: SEED.superAdminUserId,
      operations: ['UPDATE'],
      resource: 'public.notifications',
      from: todayUtc(),
      to: todayUtc(),
    });

    await page.waitForURL(/actions=/);

    // Todas las filas cumplen los filtros (aserciones que reintentan hasta
    // que la tabla muestra la página filtrada).
    await expect(
      page
        .getByTestId('audit-log-operation')
        .filter({ hasNotText: /^UPDATE$/ }),
    ).toHaveCount(0);
    await expect(
      page
        .getByTestId('audit-log-resource')
        .filter({ hasNotText: /^public\.notifications$/ }),
    ).toHaveCount(0);
    await expect(auditLogs.rowForRecord(id)).toHaveCount(1);

    // 3. Ficha con la comparación campo a campo.
    await auditLogs.rowForRecord(id).click();
    await page.waitForURL(/\/admin\/cms\/audit-logs\/[0-9a-f-]{36}$/);
    await auditLogs.waitForHydration('audit-log-details');

    await expect(page.getByTestId('audit-log-details-operation')).toHaveText(
      'UPDATE',
    );
    await expect(page.getByTestId('audit-log-details-resource')).toHaveText(
      'public.notifications',
    );
    await expect(page.getByTestId('audit-log-details-actor')).toContainText(
      SEED.superAdminEmail,
    );

    const dismissed = auditLogs.diffRow('dismissed');

    await expect(dismissed).toHaveAttribute('data-status', 'changed');
    await expect(dismissed.getByTestId('audit-log-diff-old')).toHaveText('No');
    await expect(dismissed.getByTestId('audit-log-diff-new')).toHaveText('Yes');
    await expect(auditLogs.diffRow('body')).toHaveAttribute(
      'data-status',
      'unchanged',
    );

    // Pestaña con los datos nuevos en JSON.
    await page.getByTestId('audit-log-tab-new').click();
    await expect(page.getByTestId('audit-log-new-data')).toContainText(
      `${RUN_ID}-edit`,
    );

    // Enlace al registro afectado.
    await page.getByTestId('audit-log-details-open-record').click();
    await page.waitForURL(`**/${NOTIFICATIONS_PATH}/record/${id}`);
  });

  test('un filtro o cursor no válido se rechaza con un código estable', async ({
    page,
  }) => {
    await page.goto('/admin/cms');

    for (const query of [
      'startDate=2026-02-31',
      'author=%25',
      'action=INSERT;DROP',
      'cursor=not-a-cursor',
      'limit=1000',
    ]) {
      const response = await page.request.get(
        `/api/cms/v1/audit-logs?${query}`,
      );

      expect(response.status(), query).toBe(400);
      expect(await response.json()).toMatchObject({
        errorCode: 'AUDIT_LOG_INVALID_FILTER',
      });
    }
  });
});

test.describe('Registro de auditoría: personal de soporte', () => {
  AuthPageObject.setupSession(AUTH_STATES.CMS_STAFF);

  test('ve la sección y sus propias entradas, nunca las del super-admin', async ({
    page,
    browser,
  }) => {
    const cms = new CmsPageObject(page);
    const auditLogs = new AuditLogsPageObject(page);
    const { logId, rootAccountId } = await createSuperAdminAuditLog(browser);

    await page.goto('/admin/cms');
    await expect(cms.cmsSidebarEntry('auditLogs')).toBeVisible();

    // Una acción propia (guardar sus preferencias) deja una entrada suya.
    const preferences = await page.request.post(
      '/api/cms/v1/account/preferences',
      { data: { timezone: 'UTC' } },
    );

    expect(preferences.status()).toBe(200);

    // Solo ve entradas de su propia cuenta (nadie más tiene rango ≤ 30).
    await expect
      .poll(async () => {
        const response = await page.request.get(
          '/api/cms/v1/audit-logs?limit=100',
        );
        const body = (await response.json()) as AuditLogsResponse;

        return body.logs.length > 0 &&
          body.logs.every((log) => log.accountId === SEED.cmsStaffAccountId)
          ? 'solo las suyas'
          : JSON.stringify(body.logs.map((log) => log.accountId));
      })
      .toBe('solo las suyas');

    // Filtrar por el super-admin no devuelve nada.
    const byRoot = await page.request.get(
      `/api/cms/v1/audit-logs?author=${SEED.superAdminUserId}`,
    );

    expect(byRoot.status()).toBe(200);
    expect(((await byRoot.json()) as AuditLogsResponse).logs).toEqual([]);

    // La entrada del super-admin por id: 404 (no se confirma que exista).
    const detail = await page.request.get(`/api/cms/v1/audit-logs/${logId}`);

    expect(detail.status()).toBe(404);
    expect(await detail.json()).toMatchObject({
      errorCode: 'AUDIT_LOG_NOT_FOUND',
    });

    // El registro de la cuenta Root: 403 por rango.
    const member = await page.request.get(
      `/api/cms/v1/audit-logs/member/${rootAccountId}`,
    );

    expect(member.status()).toBe(403);
    expect(await member.json()).toMatchObject({
      errorCode: 'AUDIT_LOG_PERMISSION_DENIED',
    });

    // Su propio registro de miembro sí.
    const own = await page.request.get(
      `/api/cms/v1/audit-logs/member/${SEED.cmsStaffAccountId}`,
    );

    expect(own.status()).toBe(200);

    // En la interfaz, la ficha de esa entrada es «no encontrado».
    await page.goto(`/admin/cms/audit-logs/${logId}`);
    await expect(cms.notFound()).toBeVisible();

    // El listado se muestra y no contiene la entrada del super-admin.
    await auditLogs.goto();
    await expect(
      page.getByTestId('audit-log-actor').filter({
        hasText: SEED.superAdminEmail,
      }),
    ).toHaveCount(0);
  });

  test('la API no permite crear, modificar ni borrar entradas', async ({
    page,
    browser,
  }) => {
    const { logId } = await createSuperAdminAuditLog(browser);

    await page.goto('/admin/cms');

    const forged = {
      operation: 'DELETE',
      schemaName: 'public',
      tableName: 'orders',
      accountId: SEED.cmsStaffAccountId,
    };

    const responses = await Promise.all([
      page.request.post('/api/cms/v1/audit-logs', { data: forged }),
      page.request.put(`/api/cms/v1/audit-logs/${logId}`, { data: forged }),
      page.request.patch(`/api/cms/v1/audit-logs/${logId}`, { data: forged }),
      page.request.delete(`/api/cms/v1/audit-logs/${logId}`, {
        headers: SAME_ORIGIN,
      }),
    ]);

    for (const response of responses) {
      expect(response.status(), response.url()).toBe(404);
    }

    // La entrada sigue ahí (la lee el super-admin).
    const context = await browser.newContext({
      storageState: AUTH_STATES.SUPER_ADMIN,
    });

    try {
      const adminPage = await context.newPage();

      await adminPage.goto('/admin/cms');

      const stillThere = await adminPage.request.get(
        `/api/cms/v1/audit-logs/${logId}`,
      );

      expect(stillThere.status()).toBe(200);
    } finally {
      await context.close();
    }
  });
});
