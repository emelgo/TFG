/**
 * Pruebas E2E de la ficha de un registro del explorador de datos (F2.4b).
 *
 * Usan la cuenta de equipo del *seed* (con cuatro miembros en
 * `public.accounts_memberships`) para recorrer la ficha: abrirla desde el
 * listado, ver los campos formateados, ver y seguir sus registros
 * relacionados (una clave compuesta: usuario + cuenta), volver al listado y
 * comprobar que una clave inexistente responde 404.
 *
 * Después, con el personal de soporte (rol «Soporte», que solo lee
 * `public.accounts` y `public.accounts_memberships`), se comprueba que los
 * permisos también se aplican a las relaciones: no ve secciones ni enlaces
 * de tablas que no puede leer, y una ficha de una tabla sin permiso responde
 * 404 aunque se escriba la URL.
 *
 * [TFG] RF-09 · ADR-014: ficha del explorador con permisos del RBAC del CMS.
 */
import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { CmsPageObject } from './cms.po';
import { DataExplorerPageObject } from './data-explorer.po';
import { RecordPageObject } from './record.po';

/** Cuenta de equipo del *seed* y uno de sus miembros (propietario). */
const TEAM_ACCOUNT_ID = '5deaa894-2094-4da3-b4fd-1fada0809d1c';
const TEAM_OWNER_ID = '31a03e74-1639-45b6-bfa7-77447f1a4762';

const TEAM_FILTER = `?filters=${encodeURIComponent(
  JSON.stringify({ 'id.eq': TEAM_ACCOUNT_ID }),
)}`;

const MEMBERSHIP_PATH = `public/accounts_memberships/record?user_id=${TEAM_OWNER_ID}&account_id=${TEAM_ACCOUNT_ID}`;

test.describe('Ficha de un registro: super-admin con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('al pulsar una fila se abre la ficha con los campos formateados', async ({
    page,
  }) => {
    const explorer = new DataExplorerPageObject(page);
    const record = new RecordPageObject(page);

    await explorer.goto('public', 'accounts', TEAM_FILTER);
    await expect(explorer.rows()).toHaveCount(1);

    // Se pulsa una celda de texto (las de relación llevan su propio enlace).
    await explorer.rows().first().getByTestId('cell-slug').click();

    await page.waitForURL(`**/public/accounts/record/${TEAM_ACCOUNT_ID}`);
    await expect(record.recordPage()).toBeVisible();

    // El formato de la tabla nombra al registro en las migas de pan.
    await expect(record.title()).not.toBeEmpty();

    // Booleano como insignia, JSON preformateado y UUID abreviado.
    await expect(record.fieldValue('is_personal_account')).toContainText('No');
    await expect(record.fieldValue('public_data').locator('pre')).toHaveText(
      '{}',
    );
    await expect(record.fieldValue('id')).toContainText(
      TEAM_ACCOUNT_ID.slice(0, 8),
    );

    // El super-admin (raíz del CMS) puede editar y borrar (F2.4c).
    await expect(page.getByTestId('edit-record-button')).toBeVisible();
    await expect(page.getByTestId('delete-record-button')).toBeVisible();
  });

  test('muestra los miembros del equipo y se puede seguir un registro relacionado', async ({
    page,
  }) => {
    const record = new RecordPageObject(page);

    await record.goto(`public/accounts/record/${TEAM_ACCOUNT_ID}`);
    await record.waitForHydration();

    const members = record.relatedSection('public.accounts_memberships');

    await expect(members).toBeVisible();
    await expect(
      record.relatedRows('public.accounts_memberships'),
    ).not.toHaveCount(0);

    // Cada miembro se identifica con una clave compuesta (usuario + cuenta).
    await record
      .relatedRows('public.accounts_memberships')
      .first()
      .locator('td')
      .first()
      .click();

    await page.waitForURL(
      (url) =>
        url.pathname.endsWith('/public/accounts_memberships/record') &&
        url.searchParams.get('account_id') === TEAM_ACCOUNT_ID,
    );

    await expect(record.recordPage()).toHaveAttribute(
      'data-table',
      'accounts_memberships',
    );

    // Las claves foráneas legibles enlazan a la ficha de la fila destino.
    await expect(record.fieldRelationLink('account_role')).toBeVisible();
    await record.fieldRelationLink('account_id').click();

    await page.waitForURL(`**/public/accounts/record/${TEAM_ACCOUNT_ID}`);
    await expect(record.recordPage()).toHaveAttribute('data-table', 'accounts');
  });

  test('el enlace de vuelta regresa al listado con sus filtros', async ({
    page,
  }) => {
    const explorer = new DataExplorerPageObject(page);
    const record = new RecordPageObject(page);

    await explorer.goto('public', 'accounts', TEAM_FILTER);
    await explorer.rows().first().getByTestId('cell-slug').click();
    await page.waitForURL(`**/public/accounts/record/${TEAM_ACCOUNT_ID}`);
    await record.waitForHydration();

    await record.backLink().click();

    // El listado restaura los filtros con los que se dejó.
    await explorer.waitForUrl('id.eq');
    await expect(explorer.explorer()).toBeVisible();
    await expect(explorer.rows()).toHaveCount(1);
  });

  test('una clave que no existe responde 404', async ({ page }) => {
    const cms = new CmsPageObject(page);
    const record = new RecordPageObject(page);

    await record.goto(
      'public/accounts/record/00000000-0000-4000-8000-000000000000',
    );

    await expect(cms.notFound()).toBeVisible();
    await expect(record.recordPage()).toHaveCount(0);

    // Un valor con formato no válido para la columna también es un 404.
    await record.goto('public/accounts/record/not-a-uuid');
    await expect(cms.notFound()).toBeVisible();
  });
});

test.describe('Ficha de un registro: personal de soporte con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.CMS_STAFF);

  test('abre una cuenta y solo ve relaciones con tablas que puede leer', async ({
    page,
  }) => {
    const record = new RecordPageObject(page);

    await record.goto(`public/accounts/record/${TEAM_ACCOUNT_ID}`);

    await expect(record.recordPage()).toBeVisible();
    await expect(record.fieldValue('slug')).not.toBeEmpty();

    // Solo `accounts_memberships`: facturación, invitaciones, pedidos… no.
    await expect(
      record.relatedSection('public.accounts_memberships'),
    ).toBeVisible();
    await expect(record.relatedSections()).toHaveCount(1);
  });

  test('en un miembro, solo enlaza las claves foráneas de tablas legibles', async ({
    page,
  }) => {
    const record = new RecordPageObject(page);

    await record.goto(MEMBERSHIP_PATH);

    await expect(record.recordPage()).toBeVisible();
    await expect(record.fieldRelationLink('account_id')).toBeVisible();

    // `public.roles` no es legible para soporte: se ve el valor, sin enlace.
    await expect(record.fieldValue('account_role')).toContainText('owner');
    await expect(record.fieldRelationLink('account_role')).toHaveCount(0);
  });

  test('la ficha de una tabla sin permiso responde 404', async ({ page }) => {
    const cms = new CmsPageObject(page);
    const record = new RecordPageObject(page);

    await record.goto('public/roles/record/owner');

    await expect(cms.notFound()).toBeVisible();
    await expect(record.recordPage()).toHaveCount(0);
  });
});
