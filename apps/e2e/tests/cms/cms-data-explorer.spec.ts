/**
 * Pruebas E2E del listado del explorador de datos del CMS (F2.4a).
 *
 * Con los usuarios del *seed* comprueban el recorrido principal sobre
 * `public.accounts`: ver filas, paginar y ordenar en el servidor, filtrar,
 * buscar, guardar y borrar una vista, ocultar una columna y abrir la ficha de
 * un registro. Después, con
 * el personal de soporte (rol «Soporte»), que solo puede abrir las tablas que
 * su rol permite leer: una tabla sin permiso responde 404 aunque se escriba
 * la URL, porque la API vuelve a comprobar el permiso `select`.
 *
 * Las comprobaciones no dependen del número exacto de cuentas: otras pruebas
 * E2E crean cuentas nuevas, así que se usan relaciones («menos que antes»,
 * «todas las filas contienen…») en lugar de totales fijos.
 *
 * [TFG] RF-09 · ADR-014: explorador de datos con permisos del RBAC del CMS.
 */
import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { CmsPageObject } from './cms.po';
import { DataExplorerPageObject } from './data-explorer.po';

test.describe('Explorador de datos: super-admin con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('desde la portada se abre public.accounts y se ven sus filas', async ({
    page,
  }) => {
    const cms = new CmsPageObject(page);
    const explorer = new DataExplorerPageObject(page);

    await page.goto('/admin/cms');
    await cms.resourceLink('public.accounts').click();

    await page.waitForURL('**/admin/cms/resources/public/accounts');
    await expect(explorer.explorer()).toBeVisible();
    await expect(explorer.title()).toBeVisible();

    // El *seed* crea varias cuentas (personales y el equipo de pruebas).
    expect(await explorer.getTotalCount()).toBeGreaterThan(1);
    await expect(explorer.rows().first()).toBeVisible();
  });

  test('pagina y ordena en el servidor', async ({ page }) => {
    const explorer = new DataExplorerPageObject(page);

    // Página de 2 filas para poder paginar con los datos del *seed*.
    await explorer.goto('public', 'accounts', '?pageSize=2');

    await expect(explorer.rows()).toHaveCount(2);
    await expect(explorer.pageIndicator()).toContainText('1');

    await explorer.nextPage().click();
    await explorer.waitForUrl('page=2');
    await expect(explorer.rows()).toHaveCount(2);

    // Al ordenar se vuelve a la primera página.
    await explorer.columnHeader('name').click();
    await explorer.waitForUrl('sortColumn=name');

    await expect(explorer.columnHeader('name')).toHaveAttribute(
      'data-sort-direction',
      'asc',
    );
    expect(new URL(page.url()).searchParams.get('page')).toBe('1');

    await explorer.columnHeader('name').click();

    await expect(explorer.columnHeader('name')).toHaveAttribute(
      'data-sort-direction',
      'desc',
    );
  });

  test('un filtro y la búsqueda reducen los resultados', async ({ page }) => {
    const explorer = new DataExplorerPageObject(page);

    await explorer.goto('public', 'accounts');
    const total = await explorer.getTotalCount();

    // Filtro exacto por nombre: la cuenta personal del super-admin del *seed*.
    await explorer.addTextFilter('name', 'eq', 'super-admin');
    await explorer.waitForUrl('name.eq');

    await expect(explorer.filterBadges()).toHaveCount(1);
    await expect(explorer.totalCount()).toHaveAttribute('data-count', '1');
    await expect(explorer.rows()).toHaveCount(1);

    // «Limpiar filtros» vuelve al listado completo.
    await page.getByTestId('clear-all-filters-button').click();
    await expect(explorer.totalCount()).toHaveAttribute(
      'data-count',
      String(total),
    );

    // Búsqueda global en las columnas de texto.
    await explorer.search('super-admin');
    await explorer.waitForUrl('search=super-admin');

    // La URL cambia antes de que llegue la nueva página: se espera al total.
    await expect.poll(() => explorer.getTotalCount()).toBeLessThan(total);
    await explorer.expectRowsContain('super-admin');
  });

  test('los filtros se guardan como vista y la vista se puede borrar', async ({
    page,
  }) => {
    const explorer = new DataExplorerPageObject(page);
    const viewName = `Equipos ${Date.now()}`;

    await explorer.goto('public', 'accounts', '?search=super-admin');

    await page.getByTestId('saved-views-dropdown-trigger').click();
    await page.getByTestId('save-current-view-button').click();

    await page.getByTestId('saved-view-name-input').fill(viewName);
    await page.getByTestId('submit-saved-view-button').click();

    // La vista nueva queda activa: su nombre aparece en el botón y en la URL.
    await expect(
      page.getByTestId('saved-views-dropdown-trigger'),
    ).toContainText(viewName);
    await explorer.waitForUrl('view=');

    await page.getByTestId('saved-views-dropdown-trigger').click();

    await page
      .locator(`[data-testid="saved-view-item"][data-view-name="${viewName}"]`)
      .getByTestId('delete-view-button')
      .click();

    await page.getByTestId('confirm-delete-view-button').click();

    await expect(
      page.getByTestId('saved-views-dropdown-trigger'),
    ).not.toContainText(viewName);
  });

  test('una columna se puede ocultar y la preferencia se recuerda', async ({
    page,
  }) => {
    const explorer = new DataExplorerPageObject(page);

    await explorer.goto('public', 'accounts');
    await expect(explorer.columnHeader('email')).toBeVisible();

    await explorer.toggleColumnVisibility('email');
    await expect(explorer.columnHeader('email')).toHaveCount(0);

    await page.reload();
    await explorer.waitForHydration();
    await expect(explorer.columnHeader('email')).toHaveCount(0);

    // Se deja la preferencia como estaba.
    await explorer.toggleColumnVisibility('email');
    await expect(explorer.columnHeader('email')).toBeVisible();
  });

  test('al pulsar una fila se abre la ficha del registro', async ({ page }) => {
    const explorer = new DataExplorerPageObject(page);

    await explorer.goto('public', 'accounts');
    // Una celda de texto: la primera columna es la de selección (casillas)
    // y las de relación llevan su propio enlace.
    await explorer.rows().first().getByTestId('cell-name').click();

    await page.waitForURL('**/admin/cms/resources/public/accounts/record/**');
    await expect(page.getByTestId('cms-record-page')).toBeVisible();
  });
});

test.describe('Explorador de datos: personal de soporte con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.CMS_STAFF);

  test('puede abrir una tabla que su rol permite leer', async ({ page }) => {
    const explorer = new DataExplorerPageObject(page);

    await explorer.goto('public', 'accounts');

    await expect(explorer.explorer()).toBeVisible();
    await expect(explorer.rows().first()).toBeVisible();
  });

  test('una tabla sin permiso responde 404', async ({ page }) => {
    const cms = new CmsPageObject(page);
    await page.goto('/admin/cms/resources/public/billing_customers');

    await expect(cms.notFound()).toBeVisible();
    await expect(page.getByTestId('data-explorer')).toHaveCount(0);
  });
});
