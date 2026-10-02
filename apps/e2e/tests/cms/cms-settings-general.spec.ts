/**
 * Pruebas E2E de Ajustes > General del CMS (F2.7a).
 *
 *  - El super-admin cambia su zona horaria desde la interfaz y las fechas
 *    del explorador de datos se muestran en la zona nueva (la zona llega a
 *    `FormatterPreferencesProvider` al invalidar la cuenta). Al terminar la
 *    deja en UTC, el valor por defecto del CMS.
 *  - La API rechaza una zona horaria desconocida con 400 y su código.
 *  - El personal de soporte también tiene la pestaña General (preferencias
 *    personales), pero ninguna otra.
 *
 * [TFG] RF-09 · ADR-013.
 */
import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { SettingsPageObject } from './settings.po';

/** Cuenta personal del super-admin del *seed* (tiene `created_at`). */
const SUPER_ADMIN_ACCOUNT_ID = 'c5b930c9-0a76-412e-a836-4bc4849a3270';

/** Zona con un desfase grande respecto a UTC (+14 h): cambia la hora mostrada. */
const FAR_TIMEZONE = 'Pacific/Kiritimati';

/** Listado de `public.accounts` filtrado a una sola fila. */
const ACCOUNT_ROW_URL = `/admin/cms/resources/public/accounts?filters=${encodeURIComponent(
  JSON.stringify({ 'id.eq': SUPER_ADMIN_ACCOUNT_ID }),
)}`;

test.describe('Ajustes > General: super-admin con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  // Cambia una preferencia compartida por las pruebas del super-admin: las
  // de este fichero no se ejecutan en paralelo entre sí.
  test.describe.configure({ mode: 'serial' });

  test('/admin/cms/settings redirige a General y muestra las cuatro pestañas', async ({
    page,
  }) => {
    const settings = new SettingsPageObject(page);

    await page.goto('/admin/cms/settings');
    await page.waitForURL('**/admin/cms/settings/general');

    await settings.expectTabs([
      'general',
      'authentication',
      'members',
      'permissions',
      'resources',
    ]);
  });

  test('cambiar la zona horaria cambia las fechas del explorador', async ({
    page,
  }) => {
    const settings = new SettingsPageObject(page);
    const createdAt = page.getByTestId('cell-created_at').first();

    try {
      // Punto de partida conocido: UTC (por la API; en el formulario no se
      // podría «guardar» si ya es el valor actual).
      const reset = await page.request.post('/api/cms/v1/account/preferences', {
        data: { timezone: 'UTC' },
      });

      expect(reset.status()).toBe(200);

      await page.goto(ACCOUNT_ROW_URL);
      await expect(createdAt).toBeVisible();
      const inUtc = (await createdAt.textContent())?.trim();

      expect(inUtc).toBeTruthy();

      // Zona lejana: la misma fila muestra otra fecha u hora.
      await settings.gotoGeneral();
      await settings.saveTimezone(FAR_TIMEZONE);

      await page.goto(ACCOUNT_ROW_URL);
      await expect(createdAt).toBeVisible();
      await expect(createdAt).not.toHaveText(inUtc ?? '');
    } finally {
      // Se restaura siempre el valor por defecto (UTC), falle o no la prueba.
      const restored = await page.request.post(
        '/api/cms/v1/account/preferences',
        { data: { timezone: 'UTC' } },
      );

      expect(restored.status()).toBe(200);
    }
  });

  test('la API rechaza una zona horaria desconocida con su código', async ({
    page,
  }) => {
    const response = await page.request.post(
      '/api/cms/v1/account/preferences',
      { data: { timezone: 'Mars/Olympus_Mons' } },
    );

    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({
      errorCode: 'SETTINGS_INVALID_DATA',
    });
  });
});

test.describe('Ajustes > General: personal de soporte', () => {
  AuthPageObject.setupSession(AUTH_STATES.CMS_STAFF);

  test('solo ve la pestaña General', async ({ page }) => {
    const settings = new SettingsPageObject(page);

    await settings.gotoGeneral();
    await settings.expectTabs(['general']);
  });
});
