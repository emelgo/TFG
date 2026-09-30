/**
 * Pruebas E2E de Ajustes > Autenticación del CMS (F2.7a): la obligación de
 * MFA para todo el personal.
 *
 *  - El super-admin (cuenta raíz con sesión aal2) ve el aviso, la desactiva
 *    confirmándolo, comprueba que queda en la auditoría como aviso y la
 *    vuelve a activar. Se restaura SIEMPRE (`finally`): el resto de pruebas
 *    y el propio CMS cuentan con que el MFA es obligatorio.
 *  - El personal de soporte (sin permiso `system_setting`) no ve la pestaña,
 *    la URL responde «no encontrado» y la API, 403 con su código, tanto al
 *    leer como al intentar desactivarla.
 *
 * [TFG] RNF-02 · ADR-014 · ADR-016.
 */
import { expect, request, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { SettingsPageObject } from './settings.po';

test.describe('Ajustes > Autenticación: super-admin con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  // Segunda red de seguridad: aunque la prueba agote su tiempo y Playwright
  // cierre su página (y con ella `page.request`), un contexto nuevo con la
  // sesión del super-admin vuelve a exigir el MFA.
  test.afterAll(async () => {
    const context = await request.newContext({
      baseURL: 'http://localhost:3100',
      storageState: AUTH_STATES.SUPER_ADMIN,
    });

    try {
      const restored = await context.put('/api/cms/v1/configuration/mfa', {
        data: { requiresMfa: true },
      });

      expect(restored.status()).toBe(200);
    } finally {
      await context.dispose();
    }
  });

  test('desactiva y vuelve a activar la obligación de MFA', async ({
    page,
  }) => {
    const settings = new SettingsPageObject(page);
    const form = page.getByTestId('mfa-requirement-form');

    try {
      await page.goto('/admin/cms/settings');
      await settings.tab('authentication').click();
      await page.waitForURL('**/admin/cms/settings/authentication');

      await expect(page.getByTestId('mfa-requirement-warning')).toBeVisible();
      await expect(form).toHaveAttribute('data-requires-mfa', 'true');

      // Desactivar exige confirmarlo en un diálogo.
      await page.getByTestId('mfa-requirement-switch').click();
      await page.getByTestId('mfa-requirement-submit').click();
      await expect(page.getByTestId('mfa-disable-dialog')).toBeVisible();

      const disabled = page.waitForResponse(
        (response) =>
          response.url().includes('/api/cms/v1/configuration/mfa') &&
          response.request().method() === 'PUT',
      );

      await page.getByTestId('mfa-disable-confirm').click();
      expect((await disabled).status()).toBe(200);
      await expect(form).toHaveAttribute('data-requires-mfa', 'false');

      // El cambio queda en la auditoría como aviso.
      const logs = await page.request.get(
        '/api/cms/v1/audit-logs?table=configuration&severity=warning&limit=5',
      );

      expect(logs.status()).toBe(200);
      expect(
        ((await logs.json()) as { logs: Array<{ tableName: string }> }).logs
          .length,
      ).toBeGreaterThan(0);

      // Volver a activarla no pide confirmación.
      await page.getByTestId('mfa-requirement-switch').click();

      const enabled = page.waitForResponse(
        (response) =>
          response.url().includes('/api/cms/v1/configuration/mfa') &&
          response.request().method() === 'PUT',
      );

      await page.getByTestId('mfa-requirement-submit').click();
      expect((await enabled).status()).toBe(200);
      await expect(form).toHaveAttribute('data-requires-mfa', 'true');
    } finally {
      // Restauración incondicional: el MFA vuelve a ser obligatorio.
      const restored = await page.request.put('/api/cms/v1/configuration/mfa', {
        data: { requiresMfa: true },
      });

      expect(restored.status()).toBe(200);
    }
  });
});

test.describe('Ajustes > Autenticación: personal de soporte', () => {
  AuthPageObject.setupSession(AUTH_STATES.CMS_STAFF);

  test('no ve la pestaña y la URL responde «no encontrado»', async ({
    page,
  }) => {
    const settings = new SettingsPageObject(page);

    await settings.gotoGeneral();
    await expect(settings.tab('authentication')).toHaveCount(0);

    await page.goto('/admin/cms/settings/authentication');
    await expect(settings.notFound()).toBeVisible();
  });

  test('la API le responde 403 con su código al leer y al desactivar', async ({
    page,
  }) => {
    const read = await page.request.get('/api/cms/v1/configuration/mfa');

    expect(read.status()).toBe(403);
    expect(await read.json()).toMatchObject({
      errorCode: 'SETTINGS_PERMISSION_DENIED',
    });

    const disable = await page.request.put('/api/cms/v1/configuration/mfa', {
      data: { requiresMfa: false },
    });

    expect(disable.status()).toBe(403);
    expect(await disable.json()).toMatchObject({
      errorCode: 'SETTINGS_PERMISSION_DENIED',
    });
  });
});
