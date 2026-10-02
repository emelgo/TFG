/**
 * Pruebas E2E de la ayuda «?» de los campos de la consola (RNF-08).
 *
 * Con el super-admin (sesión con MFA) comprueba que:
 *  - en Ajustes → Recursos (diálogo de una columna de `blog_posts`) el «?»
 *    abre la explicación con un clic y no envía el formulario;
 *  - en Paneles (diálogo de crear panel) se abre también con el teclado;
 *  - en el formulario de crear un registro de `public.blog_posts`, la ayuda
 *    de cada campo es la descripción de la columna guardada en los
 *    metadatos del CMS (migración `20261002160000_cms_column_descriptions`).
 *
 * Solo lee: no guarda nada.
 *
 * [TFG] RNF-08 · ADR-020.
 */
import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { DashboardsPageObject } from './dashboards.po';
import { RecordFormPageObject } from './record-form.po';
import { SettingsPageObject } from './settings.po';

test.describe('Ayuda de los campos de la consola', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('Ajustes → Recursos: el «?» de una columna explica el campo', async ({
    page,
  }) => {
    const settings = new SettingsPageObject(page);

    await page.goto('/admin/cms/settings/resources/public/blog_posts');
    await settings.waitForHydration('resource-settings-view');

    await page.getByTestId('column-edit-slug').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('column-settings-label')).toBeVisible();

    const help = dialog.getByRole('button', { name: 'Ayuda: Etiqueta' });
    await help.click();

    await expect(page.getByTestId('field-help-content')).toContainText(
      'Nombre de la columna que verás',
    );
    // Pulsar el «?» no envía el formulario: el diálogo sigue abierto.
    await expect(dialog.getByTestId('column-settings-label')).toBeVisible();
  });

  test('Paneles: el «?» del nombre se abre con el teclado', async ({
    page,
  }) => {
    const dashboards = new DashboardsPageObject(page);

    await page.goto('/admin/cms/dashboards');
    await dashboards.clickUntilVisible(
      'dashboard-create',
      'dashboard-name-dialog',
    );

    const help = page
      .getByTestId('dashboard-name-dialog')
      .getByTestId('field-help');

    await help.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('field-help-content')).toContainText(
      'Nombre del panel',
    );
  });

  test('Crear un registro de blog_posts: la ayuda es la descripción de la columna', async ({
    page,
  }) => {
    const form = new RecordFormPageObject(page);

    await page.goto('/admin/cms/resources/public/blog_posts/new');
    await form.waitForForm();

    await form.field('excerpt').getByTestId('field-help').click();

    await expect(page.getByTestId('field-help-content')).toContainText(
      'Resumen breve (una o dos frases)',
    );
  });
});
