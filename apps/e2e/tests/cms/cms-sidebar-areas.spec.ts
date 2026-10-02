/**
 * Pruebas E2E de la barra lateral por áreas de negocio (F3c, ADR-020).
 *
 * La consola es una sola herramienta organizada por áreas («Blog»,
 * «Cuentas», «Facturación», «Sistema»), definidas en
 * `cms.table_metadata.ui_config.navigation_group`:
 *
 *  1. **Super-admin con MFA:** ve las cuatro áreas; dentro de «Cuentas», la
 *     primera entrada es «Gestión de cuentas», que lleva a `/admin/accounts`.
 *  2. **Personal de soporte con MFA:** como solo puede leer dos tablas de
 *     cuentas, solo ve el área «Cuentas» con esas dos tablas y sin «Gestión
 *     de cuentas» (es una pantalla de la plataforma).
 *
 * [TFG] RF-08 · RF-09 · ADR-014 · ADR-020.
 */
import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { CmsPageObject } from './cms.po';

test.describe('Barra lateral por áreas: super-admin con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('muestra las áreas y «Gestión de cuentas» lleva a /admin/accounts', async ({
    page,
  }) => {
    const cms = new CmsPageObject(page);

    await page.goto('/admin');

    for (const area of ['Blog', 'Cuentas', 'Facturación', 'Sistema']) {
      await expect(cms.sidebarArea(area)).toBeVisible();
    }

    await expect(cms.sidebarAreaToggles()).toHaveCount(4);

    await cms.openSidebarArea('Cuentas');

    // «Gestión de cuentas» es la primera entrada del área.
    await expect(
      cms.sidebarArea('Cuentas').locator('a[href]').first(),
    ).toHaveAttribute('data-testid', 'admin-sidebar-platform-accounts');

    await cms.accountsManagementEntry().click();
    await page.waitForURL('**/admin/accounts');
  });
});

test.describe('Barra lateral por áreas: personal de soporte con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.CMS_STAFF);

  test('solo ve el área Cuentas con sus dos tablas', async ({ page }) => {
    const cms = new CmsPageObject(page);

    await page.goto('/admin/cms');

    await expect(cms.sidebarAreaToggles()).toHaveCount(1);
    await expect(cms.sidebarArea('Cuentas')).toBeVisible();

    // Al ser la única área, se muestra desplegada.
    await expect(cms.sidebarAreaToggle('Cuentas')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(cms.sidebarResources()).toHaveCount(2);
    await expect(cms.sidebarResource('public.accounts')).toBeVisible();
    await expect(
      cms.sidebarResource('public.accounts_memberships'),
    ).toBeVisible();
    await expect(cms.accountsManagementEntry()).toHaveCount(0);
  });
});
