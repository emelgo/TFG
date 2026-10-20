/**
 * Pruebas E2E del resumen de cada pantalla de la consola: una o dos frases
 * bajo el título que explican qué se hace en ella (`PageSummary` de
 * `@pymekit/ui/page`).
 *
 *  - Una pestaña de Gestión (Paneles) muestra su resumen fijo.
 *  - El listado de una tabla muestra la descripción de la tabla guardada en
 *    los metadatos del CMS (`cms.table_metadata.description`).
 *
 * [TFG] RF-09.
 */
import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';

test.describe('Resumen de las pantallas de la consola', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('Paneles muestra su resumen', async ({ page }) => {
    await page.goto('/admin/cms/dashboards');

    await expect(
      page.getByTestId('dashboards-list').getByTestId('page-summary'),
    ).toContainText('Paneles con cifras');
  });

  test('el listado de una tabla muestra su descripción', async ({ page }) => {
    await page.goto('/admin/cms/resources/public/blog_posts');

    await expect(
      page.getByTestId('data-explorer').getByTestId('page-summary'),
    ).toHaveText('Entradas del blog de la web pública');
  });
});
