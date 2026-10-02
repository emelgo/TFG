/**
 * Pruebas E2E de la visualización legible del CMS y de los recursos que ve
 * cada perfil (F2.6b, ADR-017).
 *
 *  1. **Formatos de visualización:** las relaciones se muestran con un texto
 *     legible en lugar del uuid: el miembro de una membresía con su nombre y
 *     email (relación virtual `user_id` → `public.accounts`), y el autor y la
 *     categoría de una entrada del blog. Se comprueba en el listado, en la
 *     ficha y en el selector de claves foráneas del formulario.
 *  2. **Barra lateral:** lista las tablas legibles agrupadas por área y
 *     marca la tabla abierta.
 *  3. **Recursos según el rol:** el super-admin ve el rol de una membresía
 *     como enlace a `public.roles`; el personal de soporte solo ve
 *     `public.accounts` y `public.accounts_memberships`, y en las membresías
 *     ve la cuenta enlazada pero el rol sin enlace (no puede leer
 *     `public.roles`).
 *
 * [TFG] RF-09 · ADR-014 · ADR-017.
 */
import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { CmsPageObject } from './cms.po';
import { DataExplorerPageObject } from './data-explorer.po';
import { RecordFormPageObject } from './record-form.po';
import { RecordPageObject } from './record.po';

/** Cuenta de equipo del *seed* y dos de sus miembros. */
const TEAM_ACCOUNT_ID = '5deaa894-2094-4da3-b4fd-1fada0809d1c';
const OWNER_USER_ID = '5c064f1b-78ee-4e1c-ac3b-e99aa97c99bf';

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

function filtersQuery(filters: Record<string, string>) {
  return `?filters=${encodeURIComponent(JSON.stringify(filters))}`;
}

/** Tablas de la barra lateral de la consola. */
function resourcesSidebar(page: import('@playwright/test').Page) {
  const cms = new CmsPageObject(page);

  return {
    group: () => page.getByTestId('admin-sidebar-areas'),
    area: (name: string) => cms.sidebarArea(name),
    openArea: (name: string) => cms.openSidebarArea(name),
    link: (qualifiedName: string) => cms.sidebarResource(qualifiedName),
    links: () => cms.sidebarResources(),
  };
}

test.describe('Visualización legible: super-admin con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('las membresías muestran el nombre y el email del miembro', async ({
    page,
  }) => {
    const explorer = new DataExplorerPageObject(page);

    await explorer.goto(
      'public',
      'accounts_memberships',
      filtersQuery({ 'account_id.eq': TEAM_ACCOUNT_ID }),
    );

    const members = page.getByTestId('cell-user_id');

    await expect(members.filter({ hasText: 'owner@pymekit.test' })).toHaveCount(
      1,
    );
    await expect(members.filter({ hasText: 'test@pymekit.test' })).toHaveCount(
      1,
    );

    // Ninguna celda de miembro muestra un uuid
    for (const text of await members.allInnerTexts()) {
      expect(text).not.toMatch(UUID_PATTERN);
    }

    // La cuenta de equipo se muestra por su nombre y slug
    await expect(page.getByTestId('cell-account_id').first()).toContainText(
      'PymeKit (pymekit)',
    );
  });

  test('la ficha de una membresía enlaza a la cuenta del miembro', async ({
    page,
  }) => {
    const record = new RecordPageObject(page);

    await record.goto(
      `public/accounts_memberships/record?user_id=${OWNER_USER_ID}&account_id=${TEAM_ACCOUNT_ID}`,
    );

    await expect(record.recordPage()).toBeVisible();
    await expect(record.fieldRelationLink('user_id')).toContainText(
      'owner@pymekit.test',
    );

    await record.fieldRelationLink('user_id').click();
    await page.waitForURL(`**/public/accounts/record/${OWNER_USER_ID}`);
  });

  test('las entradas del blog muestran la categoría y el autor', async ({
    page,
  }) => {
    const explorer = new DataExplorerPageObject(page);

    await explorer.goto(
      'public',
      'blog_posts',
      filtersQuery({ 'slug.eq': 'proteger-los-datos-de-tus-clientes' }),
    );

    await expect(explorer.rows()).toHaveCount(1);
    await expect(page.getByTestId('cell-category_id')).toHaveText(/Seguridad/);
    await expect(page.getByTestId('cell-author_id')).toContainText(
      'super-admin (super-admin@pymekit.test)',
    );
  });

  test('el selector de claves foráneas muestra etiquetas legibles', async ({
    page,
  }) => {
    const form = new RecordFormPageObject(page);

    await page.goto('/admin/cms/resources/public/blog_posts/new');
    await form.waitForForm();

    await form
      .field('category_id')
      .getByTestId('record-field-relation-picker')
      .click();

    const options = page.getByTestId('relation-picker-option');

    await expect(options.filter({ hasText: 'Finanzas' })).toHaveCount(1);

    for (const text of await options.allInnerTexts()) {
      expect(text).not.toMatch(UUID_PATTERN);
    }
  });

  test('la barra lateral lista los recursos agrupados por área', async ({
    page,
  }) => {
    const sidebar = resourcesSidebar(page);

    await page.goto('/admin/cms');

    await expect(sidebar.group()).toBeVisible();
    await expect(sidebar.area('Blog')).toBeVisible();

    await sidebar.openArea('Blog');
    await sidebar.openArea('Cuentas');
    await expect(sidebar.link('public.blog_posts')).toBeVisible();

    await sidebar.link('public.accounts').click();
    await page.waitForURL('**/admin/cms/resources/public/accounts');

    await expect(sidebar.link('public.accounts')).toHaveAttribute(
      'data-active',
      /.*/,
    );
    await expect(sidebar.link('public.blog_posts')).not.toHaveAttribute(
      'data-active',
      /.*/,
    );
  });

  test('el super-admin ve el rol de una membresía como enlace', async ({
    page,
  }) => {
    const explorer = new DataExplorerPageObject(page);

    // `account_role` apunta a `public.roles`, que el super-admin sí puede leer
    await explorer.goto(
      'public',
      'accounts_memberships',
      filtersQuery({ 'account_id.eq': TEAM_ACCOUNT_ID }),
    );

    await expect(
      page
        .getByTestId('cell-account_role')
        .first()
        .getByTestId('relation-cell-link'),
    ).toHaveCount(1);
  });
});

test.describe('Recursos visibles: personal de soporte con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.CMS_STAFF);

  test('solo ve las tablas que su rol puede leer', async ({ page }) => {
    const cms = new CmsPageObject(page);
    const sidebar = resourcesSidebar(page);

    await page.goto('/admin/cms');

    await expect(cms.resourceLink('public.accounts')).toBeVisible();
    await expect(cms.resourceLink('public.accounts_memberships')).toBeVisible();

    for (const table of ['roles', 'subscriptions', 'blog_posts']) {
      await expect(cms.resourceLink(`public.${table}`)).toHaveCount(0);
    }

    // La barra lateral refleja los mismos permisos
    await expect(sidebar.links()).toHaveCount(2);
    await expect(sidebar.link('public.accounts')).toBeVisible();
    await expect(sidebar.link('public.blog_posts')).toHaveCount(0);
  });

  test('una tabla sin permiso responde «no encontrado»', async ({ page }) => {
    const cms = new CmsPageObject(page);

    await page.goto('/admin/cms/resources/public/subscriptions');

    await expect(cms.notFound()).toBeVisible();
  });

  test('en las membresías ve la cuenta enlazada, pero el rol solo como valor', async ({
    page,
  }) => {
    const explorer = new DataExplorerPageObject(page);

    await explorer.goto(
      'public',
      'accounts_memberships',
      filtersQuery({ 'account_id.eq': TEAM_ACCOUNT_ID }),
    );

    await expect(
      page
        .getByTestId('cell-account_id')
        .first()
        .getByTestId('relation-cell-link'),
    ).toHaveCount(1);

    // Sin permiso sobre `public.roles`, el rol queda como valor sin enlace
    await expect(
      page.getByTestId('cell-account_role').getByTestId('relation-cell-link'),
    ).toHaveCount(0);
  });
});
