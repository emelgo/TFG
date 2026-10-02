/**
 * Pruebas E2E de Ajustes > Recursos del CMS (F2.7c): configuración de las
 * tablas gestionadas y diseñador de la ficha de un registro.
 *
 * Con el super-admin (cuenta raíz, sesión con MFA):
 *  - cambia la etiqueta de la columna `slug` y oculta `created_at` en el
 *    listado de `public.blog_tags` desde la interfaz, y lo ve en el
 *    explorador;
 *  - guarda una distribución sencilla (un grupo con título propio) y la ve
 *    en la ficha de una etiqueta;
 *  - la API rechaza los esquemas protegidos (sincronizar `auth`, leer
 *    `auth.users`) con su código estable.
 * Todo se restaura al terminar con la API, aunque la prueba falle.
 *
 * Con el personal de soporte (sin permiso de sistema `table`):
 *  - no ve la pestaña, las URL responden «no encontrado» y la API, 403 con
 *    `SETTINGS_PERMISSION_DENIED`.
 *
 * [TFG] RF-09 · RNF-02 · ADR-014.
 */
import { createClient } from '@supabase/supabase-js';

import { type APIRequestContext, expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { DataExplorerPageObject } from './data-explorer.po';
import { RecordPageObject } from './record.po';
import { SettingsPageObject } from './settings.po';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SECRET_KEY = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';

const RESOURCE_API = '/api/cms/v1/settings/resources/public/blog_tags';
const COLUMNS_API = '/api/cms/v1/tables/public/blog_tags/columns';
const LAYOUT_API = '/api/cms/v1/resources/public/blog_tags/layout';

const NEW_LABEL = `Localidad E2E ${Date.now().toString(36)}`;
const GROUP_LABEL = `Grupo E2E ${Date.now().toString(36)}`;

type ColumnConfig = {
  display_name?: string | null;
  is_visible_in_table?: boolean;
};

/** Id de la etiqueta «SaaS» del *seed* (las etiquetas usan uuid). */
async function saasTagId() {
  const admin = createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await admin
    .from('blog_tags')
    .select('id')
    .eq('slug', 'saas')
    .single();

  expect(error).toBeNull();

  return data!.id as string;
}

/** Lee el metadato de `public.blog_tags` con la sesión de la página. */
async function readTags(request: APIRequestContext) {
  const response = await request.get(RESOURCE_API);

  expect(response.status()).toBe(200);

  const body = (await response.json()) as {
    data: {
      columnsConfig: Record<string, ColumnConfig>;
      uiConfig: { recordLayout?: unknown };
    };
  };

  return body.data;
}

test.describe('Ajustes > Recursos: super-admin con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('cambia etiqueta y visibilidad de columnas y una distribución, y se ven en el explorador', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const settings = new SettingsPageObject(page);
    const explorer = new DataExplorerPageObject(page);
    const record = new RecordPageObject(page);

    // Estado original para restaurarlo al final.
    const original = await readTags(page.request);
    const slug = original.columnsConfig['slug']!;
    const createdAt = original.columnsConfig['created_at']!;
    const createdAtLabel = createdAt.display_name || 'created_at';
    const tagId = await saasTagId();

    try {
      // La pestaña aparece y lleva al listado de recursos.
      await page.goto('/admin/cms/settings/general');
      await settings.tab('resources').click();
      await settings.waitForHydration('resources-settings-view');
      await expect(
        page.getByTestId('resource-row-public.blog_tags'),
      ).toBeVisible();

      await page.getByTestId('resource-configure-public.blog_tags').click();
      await settings.waitForHydration('resource-settings-view');

      // Nueva etiqueta de `slug` desde el diálogo de la columna.
      await page.getByTestId('column-edit-slug').click();
      await page.getByTestId('column-settings-label').fill(NEW_LABEL);

      const labelSaved = page.waitForResponse(
        (response) =>
          response.url().endsWith(COLUMNS_API) &&
          response.request().method() === 'PUT',
      );

      await page.getByTestId('column-settings-submit').click();
      expect((await labelSaved).status()).toBe(200);
      await expect(page.getByTestId('column-row-slug')).toContainText(
        NEW_LABEL,
      );

      // Ocultar `created_at` en el listado con el interruptor de la fila.
      const createdAtSaved = page.waitForResponse(
        (response) =>
          response.url().endsWith(COLUMNS_API) &&
          response.request().method() === 'PUT',
      );

      await page.getByTestId('column-isVisibleInTable-created_at').click();
      expect((await createdAtSaved).status()).toBe(200);

      // El explorador muestra la nueva cabecera y ya no la de `created_at`.
      await explorer.goto('public', 'blog_tags');

      const headers = page.getByTestId('data-table').locator('thead');

      await expect(headers).toContainText(NEW_LABEL);
      await expect(
        headers.getByRole('columnheader', {
          name: createdAtLabel,
          exact: true,
        }),
      ).toHaveCount(0);

      // Diseñador: la distribución por defecto con un título propio.
      await page.goto('/admin/cms/settings/resources/public/blog_tags/layout');
      await settings.waitForHydration('record-layout-designer');
      await page.getByTestId('layout-group-label-0').fill(GROUP_LABEL);

      const layoutSaved = page.waitForResponse(
        (response) =>
          response.url().endsWith(LAYOUT_API) &&
          response.request().method() === 'POST',
      );

      await page.getByTestId('layout-save').click();
      expect((await layoutSaved).status()).toBe(200);

      // La ficha de una etiqueta usa la distribución guardada.
      await record.goto(`public/blog_tags/record/${tagId}`);
      await record.waitForHydration();
      await expect(page.getByTestId('record-custom-layout')).toBeVisible();
      await expect(page.getByTestId('record-field-group')).toContainText(
        GROUP_LABEL,
      );
    } finally {
      // Restaurar etiquetas, visibilidad y distribución originales.
      const restoreColumns = await page.request.put(COLUMNS_API, {
        data: {
          slug: { display_name: slug.display_name ?? '' },
          created_at: {
            is_visible_in_table: createdAt.is_visible_in_table !== false,
          },
        },
      });

      expect(restoreColumns.status()).toBe(200);

      const restoreLayout = await page.request.post(LAYOUT_API, {
        data: { layout: original.uiConfig?.recordLayout ?? null },
      });

      expect(restoreLayout.status()).toBe(200);
    }
  });

  test('la API rechaza los esquemas protegidos y la configuración libre', async ({
    page,
  }) => {
    const sync = await page.request.post('/api/cms/v1/tables/sync', {
      data: { schema: 'auth' },
    });

    expect(sync.status()).toBe(403);
    expect(await sync.json()).toMatchObject({
      errorCode: 'SETTINGS_RESOURCE_PROTECTED_SCHEMA',
    });

    const authUsers = await page.request.get(
      '/api/cms/v1/settings/resources/auth/users',
    );

    expect(authUsers.status()).toBe(403);

    // Campos estructurales (clave primaria) o desconocidos: 400 sin tocar nada.
    const structural = await page.request.put(COLUMNS_API, {
      data: { id: { is_primary_key: false } },
    });

    expect(structural.status()).toBe(400);
    expect(await structural.json()).toMatchObject({
      errorCode: 'SETTINGS_INVALID_DATA',
    });

    // La distribución solo admite columnas de la tabla.
    const unknownField = await page.request.post(LAYOUT_API, {
      data: {
        layout: {
          id: 'l',
          name: 'n',
          display: [
            {
              id: 'g',
              label: 'G',
              rows: [
                { id: 'r', columns: [{ id: 'c', fieldName: 'nope', size: 2 }] },
              ],
            },
          ],
          edit: [],
        },
      },
    });

    expect(unknownField.status()).toBe(400);
  });
});

test.describe('Ajustes > Recursos: personal de soporte', () => {
  AuthPageObject.setupSession(AUTH_STATES.CMS_STAFF);

  test('no ve la pestaña y las URL responden «no encontrado»', async ({
    page,
  }) => {
    const settings = new SettingsPageObject(page);

    await settings.gotoGeneral();
    await expect(settings.tab('resources')).toHaveCount(0);

    await page.goto('/admin/cms/settings/resources');
    await expect(settings.notFound()).toBeVisible();

    await page.goto('/admin/cms/settings/resources/public/blog_tags/layout');
    await expect(settings.notFound()).toBeVisible();
  });

  test('la API le responde 403 con su código', async ({ page }) => {
    const list = await page.request.get('/api/cms/v1/settings/resources');

    expect(list.status()).toBe(403);
    expect(await list.json()).toMatchObject({
      errorCode: 'SETTINGS_PERMISSION_DENIED',
    });

    const columns = await page.request.put(COLUMNS_API, {
      data: { slug: { display_name: 'staff' } },
    });

    expect(columns.status()).toBe(403);
    expect(await columns.json()).toMatchObject({
      errorCode: 'SETTINGS_PERMISSION_DENIED',
    });

    const sync = await page.request.post('/api/cms/v1/tables/sync', {
      data: { schema: 'public' },
    });

    expect(sync.status()).toBe(403);
  });
});
