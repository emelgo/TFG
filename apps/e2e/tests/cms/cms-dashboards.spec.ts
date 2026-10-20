import { createClient } from '@supabase/supabase-js';

import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { DashboardsPageObject } from './dashboards.po';

/**
 * Pruebas E2E de los paneles del CMS (F2.8, RF-11).
 *
 * Con el super-admin (cuenta raíz, sesión con MFA):
 *  - crea un panel, le añade una métrica (recuento de `public.accounts`) y
 *    un gráfico de barras sobre `public.blog_posts`;
 *  - reorganiza la rejilla (mueve la métrica) y comprueba que se guarda;
 *  - lo comparte con el rol «Soporte» solo para ver.
 *
 * Con el personal de soporte (lee `public.accounts` pero no
 * `public.blog_posts`):
 *  - ve el panel entre los compartidos y la métrica con su valor;
 *  - el gráfico se muestra «sin acceso»: el panel compartido no filtra
 *    datos de tablas que su rol no puede leer (la API responde 403
 *    `DASHBOARD_WIDGET_NO_ACCESS`);
 *  - no tiene acciones de edición y la API rechaza renombrar, añadir
 *    *widgets* o borrar con 403 y su código estable.
 *
 * Al final el super-admin borra el panel desde la interfaz; `afterAll`
 * limpia con la clave de servicio lo que quedara si la prueba falla antes.
 *
 * [TFG] RF-11 · RNF-02 · ADR-013.
 */

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SECRET_KEY = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';

/** Rol «Soporte» del *seed* (rango 30). */
const SUPPORT_ROLE_ID = '9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e';

const RUN_ID = `E2E-DASH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DASHBOARD_NAME = `Panel ${RUN_ID}`;

const UUID = '[0-9a-f-]{36}';

/** Cabecera `Origin` de la web (la que envía el navegador): pasa el CSRF. */
const SAME_ORIGIN = { origin: 'http://localhost:3100' };

test.afterAll(async () => {
  // Limpieza de seguridad (ignora RLS): los widgets caen en cascada.
  await createClient(SUPABASE_URL, SECRET_KEY)
    .schema('cms')
    .from('dashboards')
    .delete()
    .eq('name', DASHBOARD_NAME);
});

test.describe('Paneles del CMS', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('el super-admin crea, organiza y comparte un panel; soporte solo lo ve', async ({
    page,
    browser,
  }) => {
    const dashboards = new DashboardsPageObject(page);

    // 1. Crear el panel desde el listado.
    await page.goto('/admin/cms/dashboards');
    await dashboards.clickUntilVisible(
      'dashboard-create',
      'dashboard-name-dialog',
    );
    await page.getByTestId('dashboard-name-input').fill(DASHBOARD_NAME);
    await page.getByTestId('dashboard-name-submit').click();
    await page.waitForURL(new RegExp(`/admin/cms/dashboards/${UUID}$`));

    const dashboardId = page.url().split('/').pop()!;

    await expect(page.getByTestId('dashboard-title')).toHaveText(
      DASHBOARD_NAME,
    );
    await expect(page.getByTestId('dashboard-permission')).toHaveText(
      'Propietario',
    );

    // 2. Métrica: recuento de cuentas (soporte puede leer public.accounts).
    const metric = await dashboards.addWidget({
      title: 'Cuentas',
      type: 'metric',
      table: 'public.accounts',
    });

    await expect(metric.getByTestId('widget-metric-value')).toHaveText(/\d/);

    // 3. Gráfico de barras: entradas del blog por estado (soporte NO puede
    //    leer public.blog_posts).
    const chart = await dashboards.addWidget({
      title: 'Entradas por estado',
      type: 'chart',
      table: 'public.blog_posts',
      xAxis: 'status',
    });

    await expect(chart.getByTestId('widget-chart')).toBeVisible();

    // 4. Organizar: mover la métrica dos columnas a la derecha y guardar.
    const before = await metric.getAttribute('data-position');

    await page.getByTestId('dashboard-arrange').click();
    await metric.getByTestId('widget-arrange-right').click();
    await metric.getByTestId('widget-arrange-right').click();

    const [x, ...rest] = before!.split(',').map(Number);
    const expected = [x! + 2, ...rest].join(',');

    await expect(metric).toHaveAttribute('data-position', expected);
    await page.getByTestId('dashboard-layout-save').click();
    await expect(page.getByTestId('dashboard-arrange')).toBeVisible();

    // La posición queda guardada (la API la devuelve tras recargar).
    await page.reload();
    await expect(metric).toHaveAttribute('data-position', expected);

    // 5. Compartir con «Soporte» solo para ver.
    await dashboards.clickUntilVisible(
      'dashboard-share',
      'share-dashboard-dialog',
    );
    await page.getByTestId('share-role-select').selectOption(SUPPORT_ROLE_ID);
    await page.getByTestId('share-level-select').selectOption('view');
    await page.getByTestId('share-submit').click();
    await expect(page.getByTestId('dashboard-share-row')).toHaveCount(1);
    await page.keyboard.press('Escape');

    // 6. Personal de soporte: ve el panel, pero no los datos que no puede
    //    leer, y no puede cambiar nada.
    const staffContext = await browser.newContext({
      storageState: AUTH_STATES.CMS_STAFF,
    });

    try {
      const staff = await staffContext.newPage();

      await staff.goto('/admin/cms/dashboards?filter=shared');
      await expect(
        staff.getByTestId('dashboard-card').filter({ hasText: DASHBOARD_NAME }),
      ).toBeVisible();

      await staff.goto(`/admin/cms/dashboards/${dashboardId}`);
      await expect(staff.getByTestId('dashboard-permission')).toHaveText(
        'Solo lectura',
      );

      const staffDashboards = new DashboardsPageObject(staff);
      const staffMetric = staffDashboards.widget('Cuentas');
      const staffChart = staffDashboards.widget('Entradas por estado');

      await expect(staffMetric.getByTestId('widget-metric-value')).toHaveText(
        /\d/,
      );
      await expect(staffChart.getByTestId('widget-no-access')).toBeVisible();
      await expect(staffChart.getByTestId('widget-chart')).toHaveCount(0);

      // Sin acciones de edición ni de propietario.
      await expect(staff.getByTestId('dashboard-add-widget')).toHaveCount(0);
      await expect(staff.getByTestId('dashboard-share')).toHaveCount(0);
      await expect(staff.getByTestId('dashboard-delete')).toHaveCount(0);
      await expect(staff.getByTestId('widget-edit')).toHaveCount(0);

      // La API lo vuelve a comprobar: 403 con su código estable.
      const detail = (await (
        await staff.request.get(`/api/cms/v1/dashboards/${dashboardId}`)
      ).json()) as {
        data: { widgets: Array<{ id: string; title: string }> };
      };
      const chartId = detail.data.widgets.find(
        (widget) => widget.title === 'Entradas por estado',
      )!.id;

      const chartData = await staff.request.get(
        `/api/cms/v1/widgets/${chartId}/data`,
      );
      expect(chartData.status()).toBe(403);
      expect(await chartData.json()).toMatchObject({
        errorCode: 'DASHBOARD_WIDGET_NO_ACCESS',
      });

      const forbidden = await Promise.all([
        staff.request.put(`/api/cms/v1/dashboards/${dashboardId}`, {
          data: { name: 'Renombrado por soporte' },
          headers: SAME_ORIGIN,
        }),
        staff.request.post('/api/cms/v1/widgets', {
          data: {
            dashboardId,
            widgetType: 'metric',
            title: 'Intruso',
            schemaName: 'public',
            tableName: 'accounts',
            config: { aggregation: 'COUNT', metric: '*' },
          },
          headers: SAME_ORIGIN,
        }),
        staff.request.delete(`/api/cms/v1/widgets/${chartId}`, {
          headers: SAME_ORIGIN,
        }),
        staff.request.delete(`/api/cms/v1/dashboards/${dashboardId}`, {
          headers: SAME_ORIGIN,
        }),
      ]);

      for (const response of forbidden) {
        expect(response.status()).toBe(403);
        expect(await response.json()).toMatchObject({
          errorCode: 'DASHBOARD_FORBIDDEN',
        });
      }
    } finally {
      await staffContext.close();
    }

    // 7. El super-admin borra el panel desde la interfaz.
    await dashboards.clickUntilVisible(
      'dashboard-delete',
      'dashboard-confirm-delete',
    );
    await page.getByTestId('dashboard-confirm-delete-submit').click();
    await page.waitForURL(/\/admin\/cms\/dashboards$/);
    await expect(
      page.getByTestId('dashboard-card').filter({ hasText: DASHBOARD_NAME }),
    ).toHaveCount(0);

    const gone = await page.request.get(
      `/api/cms/v1/dashboards/${dashboardId}`,
    );
    expect(gone.status()).toBe(404);
  });
});
