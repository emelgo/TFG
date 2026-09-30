/**
 * Pruebas E2E de la visualización legible del CMS y de la demo de pyme
 * (F2.6b, ADR-017).
 *
 *  1. **Formatos de visualización:** las relaciones se muestran con un texto
 *     legible en lugar del uuid: el miembro de una membresía con su nombre y
 *     email (relación virtual `user_id` → `public.accounts`), y el autor y la
 *     categoría de una entrada del blog. Se comprueba en el listado, en la
 *     ficha y en el selector de claves foráneas del formulario.
 *  2. **Barra lateral «Recursos»:** lista las tablas legibles, agrupadas por
 *     esquema, y marca la tabla abierta.
 *  3. **Demo de pyme:** el super-admin ve y consulta las seis tablas de
 *     `demo`; el personal de soporte solo `demo.customers` y `demo.orders`,
 *     y en los pedidos ve el nombre del cliente pero no el del comercial
 *     (no puede leer `demo.employees`).
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

const DEMO_TABLES = [
  'customers',
  'products',
  'orders',
  'order_items',
  'invoices',
  'employees',
];

function filtersQuery(filters: Record<string, string>) {
  return `?filters=${encodeURIComponent(JSON.stringify(filters))}`;
}

/** Barra lateral «Recursos» de la consola. */
function resourcesSidebar(page: import('@playwright/test').Page) {
  return {
    group: () => page.getByTestId('admin-sidebar-resources-group'),
    schema: (schema: string) =>
      page.getByTestId(`admin-sidebar-resources-schema-${schema}`),
    link: (qualifiedName: string) =>
      page.getByTestId(`admin-sidebar-resource-${qualifiedName}`),
    links: () => page.locator('[data-testid^="admin-sidebar-resource-"][href]'),
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

  test('la barra lateral lista los recursos agrupados por esquema', async ({
    page,
  }) => {
    const sidebar = resourcesSidebar(page);

    await page.goto('/admin/cms');

    await expect(sidebar.group()).toBeVisible();
    await expect(sidebar.schema('public')).toBeVisible();
    await expect(sidebar.schema('demo')).toBeVisible();
    await expect(sidebar.link('public.blog_posts')).toBeVisible();

    await sidebar.link('demo.customers').click();
    await page.waitForURL('**/admin/cms/resources/demo/customers');

    await expect(sidebar.link('demo.customers')).toHaveAttribute(
      'data-active',
      /.*/,
    );
    await expect(sidebar.link('demo.orders')).not.toHaveAttribute(
      'data-active',
      /.*/,
    );
  });

  test('el super-admin ve y consulta las tablas de la demo', async ({
    page,
  }) => {
    const cms = new CmsPageObject(page);
    const explorer = new DataExplorerPageObject(page);

    await page.goto('/admin/cms');

    for (const table of DEMO_TABLES) {
      await expect(cms.resourceLink(`demo.${table}`)).toBeVisible();
    }

    // Los pedidos muestran su cliente y su comercial por el nombre
    await explorer.goto(
      'demo',
      'orders',
      filtersQuery({ 'order_number.eq': 'PED-2026-0001' }),
    );

    await expect(explorer.rows()).toHaveCount(1);
    await expect(page.getByTestId('cell-customer_id')).not.toBeEmpty();
    await expect(page.getByTestId('cell-customer_id')).toHaveText(/\D{3,}/);
    await expect(
      page.getByTestId('cell-sales_rep_id').getByTestId('relation-cell-link'),
    ).toHaveCount(1);
  });
});

test.describe('Demo de pyme: personal de soporte con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.CMS_STAFF);

  test('solo ve clientes y pedidos entre las tablas de la demo', async ({
    page,
  }) => {
    const cms = new CmsPageObject(page);
    const sidebar = resourcesSidebar(page);

    await page.goto('/admin/cms');

    await expect(cms.resourceLink('demo.customers')).toBeVisible();
    await expect(cms.resourceLink('demo.orders')).toBeVisible();

    for (const table of ['products', 'order_items', 'invoices', 'employees']) {
      await expect(cms.resourceLink(`demo.${table}`)).toHaveCount(0);
    }

    // La barra lateral refleja los mismos permisos
    await expect(sidebar.links()).toHaveCount(4);
    await expect(sidebar.link('demo.customers')).toBeVisible();
    await expect(sidebar.link('public.blog_posts')).toHaveCount(0);
  });

  test('una tabla de la demo sin permiso responde «no encontrado»', async ({
    page,
  }) => {
    const cms = new CmsPageObject(page);

    await page.goto('/admin/cms/resources/demo/employees');

    await expect(cms.notFound()).toBeVisible();
  });

  test('en los pedidos ve el nombre del cliente pero no el del comercial', async ({
    page,
  }) => {
    const explorer = new DataExplorerPageObject(page);

    await explorer.goto(
      'demo',
      'orders',
      filtersQuery({ 'order_number.eq': 'PED-2026-0001' }),
    );

    await expect(explorer.rows()).toHaveCount(1);
    await expect(
      page.getByTestId('cell-customer_id').getByTestId('relation-cell-link'),
    ).toHaveCount(1);

    // Sin permiso sobre `demo.employees`, el comercial queda como id
    await expect(
      page.getByTestId('cell-sales_rep_id').getByTestId('relation-cell-link'),
    ).toHaveCount(0);
  });
});
