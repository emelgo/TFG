/**
 * Pruebas E2E de la base de la interfaz del CMS (F2.3).
 *
 * Comprueban, con usuarios reales del *seed*, los tres perfiles del modelo de
 * acceso de ADR-014 en la consola de administración:
 *
 *  1. **Super-admin con MFA** (raíz del CMS): ve el grupo «Plataforma» y el
 *     grupo «CMS» completo, y la portada del CMS lista las tablas.
 *  2. **Personal de soporte con MFA** (rol «Soporte», acceso limitado): entra
 *     en la consola pero directamente al CMS; no ve las páginas de la
 *     plataforma y solo ve las secciones y tablas que su rol permite.
 *  3. **Usuario normal**: el CMS no existe para él (404).
 *
 * La barra lateral y la portada reflejan lo que responde la API del CMS; la
 * seguridad real la prueban `cms-api.spec.ts` y los tests pgTAP.
 *
 * [TFG] RF-08 · RF-09 · ADR-014.
 */
import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { CmsPageObject } from './cms.po';

test.describe('CMS: super-admin con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('la consola muestra los grupos Plataforma y CMS', async ({ page }) => {
    const cms = new CmsPageObject(page);

    await page.goto('/admin');

    await expect(cms.platformGroup()).toBeVisible();
    await expect(cms.cmsGroup()).toBeVisible();

    // Root tiene todos los permisos: todas las secciones del CMS aparecen.
    await cms.expectCmsSections([
      'resources',
      'users',
      'storage',
      'auditLogs',
      'dashboards',
      'settings',
    ]);
  });

  test('la portada del CMS lista las tablas legibles', async ({ page }) => {
    const cms = new CmsPageObject(page);

    await page.goto('/admin/cms');

    await expect(cms.resourceLink('public.accounts')).toBeVisible();
  });

  test('una tabla abre su página del explorador', async ({ page }) => {
    const cms = new CmsPageObject(page);

    await page.goto('/admin/cms');
    await cms.resourceLink('public.accounts').click();

    await page.waitForURL('**/admin/cms/resources/public/accounts');
    await expect(page.getByTestId('data-explorer')).toBeVisible();
  });
});

test.describe('CMS: personal de soporte con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.CMS_STAFF);

  test('/admin lleva al CMS y oculta el grupo Plataforma', async ({ page }) => {
    const cms = new CmsPageObject(page);

    await page.goto('/admin');
    await page.waitForURL('**/admin/cms');

    await expect(cms.cmsGroup()).toBeVisible();
    await expect(cms.platformGroup()).toHaveCount(0);

    // El rol «Soporte» solo lee dos tablas y la auditoría: ni usuarios de
    // Auth ni almacenamiento.
    await cms.expectCmsSections([
      'resources',
      'auditLogs',
      'dashboards',
      'settings',
    ]);
  });

  test('las páginas de la plataforma redirigen al CMS', async ({ page }) => {
    await page.goto('/admin/accounts');

    await page.waitForURL('**/admin/cms');
  });

  test('solo ve las tablas que su rol permite leer', async ({ page }) => {
    const cms = new CmsPageObject(page);

    await page.goto('/admin/cms');

    await expect(cms.resourceLink('public.accounts')).toBeVisible();
    await expect(cms.resourceLink('public.accounts_memberships')).toBeVisible();
    // F2.6b: el seed le da además lectura de dos tablas de la demo
    await expect(cms.resourceLink('demo.customers')).toBeVisible();
    await expect(cms.resourceLink('demo.orders')).toBeVisible();
    await expect(cms.resourceLinks()).toHaveCount(4);
  });

  test('una sección sin permiso responde 404 aunque se escriba la URL', async ({
    page,
  }) => {
    const cms = new CmsPageObject(page);

    await page.goto('/admin/cms/users');

    await expect(cms.notFound()).toBeVisible();
  });
});

test.describe('CMS: usuario normal', () => {
  AuthPageObject.setupSession(AUTH_STATES.OWNER_USER);

  test('/admin/cms responde 404', async ({ page }) => {
    const cms = new CmsPageObject(page);

    await page.goto('/admin/cms');

    await expect(cms.notFound()).toBeVisible();
  });
});
