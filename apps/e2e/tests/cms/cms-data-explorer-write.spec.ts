import { createClient } from '@supabase/supabase-js';

/**
 * Pruebas E2E de las escrituras del explorador de datos (F2.4c): crear,
 * editar y borrar registros (uno y varios), con sus permisos.
 *
 * Se usa `public.notifications` porque ninguna otra suite depende de ella y
 * tiene columnas de todos los tipos que interesan (clave foránea, enumerado,
 * texto largo, booleano, fecha con valor por defecto dinámico). Cada prueba
 * crea sus propias filas —desde la interfaz o, para preparar el escenario,
 * con la clave de servicio— marcadas con un texto único, y `afterAll` borra
 * todas las que queden con esa marca.
 *
 * `public.notifications` tiene además un *trigger* que solo deja cambiar
 * `dismissed`: sirve para comprobar que un rechazo de la base de datos llega
 * a la interfaz como un error controlado (400 con código estable) y sin el
 * texto interno de PostgreSQL.
 *
 * Con el personal de soporte (rol «Soporte», solo lectura) se comprueba que
 * no ve ninguna acción de escritura y que la API responde 403 aunque se la
 * llame directamente.
 *
 * [TFG] RF-09 · RNF-02 · ADR-014: escrituras del CMS con permisos
 * comprobados en la interfaz, en la API y en la base de datos.
 */
import { type Page, expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { CmsPageObject } from './cms.po';
import { DataExplorerPageObject } from './data-explorer.po';
import { RecordFormPageObject } from './record-form.po';
import { RecordPageObject } from './record.po';

/** Cuenta de equipo del *seed* a la que se asignan las notificaciones. */
const TEAM_ACCOUNT_ID = '5deaa894-2094-4da3-b4fd-1fada0809d1c';

/**
 * Cuenta personal del super-admin (mismo id que su usuario). Solo la usa la
 * prueba de «registro relacionado», para que el recuento de su sección no
 * cambie por las notificaciones que crean otras pruebas en paralelo.
 */
const SUPER_ADMIN_ACCOUNT_ID = 'c5b930c9-0a76-412e-a836-4bc4849a3270';

/**
 * Marca de las filas que crea esta suite. Cada *worker* de Playwright carga
 * el fichero por separado y tiene la suya, así que su `afterAll` solo borra
 * sus propias filas y no las de una prueba que siga en marcha en otro.
 */
const RUN_ID = `E2E-CMS-WRITE-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;

const NOTIFICATIONS_PATH = 'public/notifications';

/** Cliente con la clave de servicio del Supabase local (ignora RLS). */
function getAdminClient() {
  return createClient(
    'http://127.0.0.1:54321',
    'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz',
  );
}

/** Crea notificaciones de prueba y devuelve sus identificadores. */
async function seedNotifications(bodies: string[]) {
  const { data, error } = await getAdminClient()
    .from('notifications')
    .insert(bodies.map((body) => ({ account_id: TEAM_ACCOUNT_ID, body })))
    .select('id');

  if (error) {
    throw new Error(
      `No se pudieron crear las notificaciones: ${error.message}`,
    );
  }

  return data.map((row) => String(row.id));
}

/** Filtro del listado por el texto de la notificación. */
function bodyFilter(text: string) {
  return `?filters=${encodeURIComponent(
    JSON.stringify({ 'body.contains': text }),
  )}`;
}

/**
 * Comprueba que existe una entrada de auditoría de la operación sobre la
 * notificación, leyendo el registro de auditoría con la API del CMS.
 */
async function expectAuditLog(page: Page, operation: string, id: string) {
  await expect
    .poll(async () => {
      const response = await page.request.get(
        `/api/cms/v1/audit-logs?action=${operation}&limit=100`,
      );

      const body = (await response.json()) as {
        logs: Array<{ tableName: string; recordId: string | null }>;
      };

      return body.logs.some(
        (log) => log.tableName === 'notifications' && log.recordId === id,
      );
    })
    .toBe(true);
}

test.afterAll(async () => {
  await getAdminClient()
    .from('notifications')
    .delete()
    .like('body', `${RUN_ID}%`);
});

test.describe('Escrituras del explorador: super-admin con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('crea un registro con el formulario y aparece en el listado', async ({
    page,
  }) => {
    const explorer = new DataExplorerPageObject(page);
    const form = new RecordFormPageObject(page);
    const record = new RecordPageObject(page);
    const body = `${RUN_ID}-create`;

    await explorer.goto('public', 'notifications');
    await form.createLink().click();

    await page.waitForURL(`**/${NOTIFICATIONS_PATH}/new`);
    await form.waitForForm();

    // Sin rellenar lo obligatorio, el formulario no se envía.
    await form.submit().click();
    await expect(form.fieldError('body')).toBeVisible();
    await expect(form.fieldError('account_id')).toBeVisible();

    // El enumerado muestra su valor por defecto y la clave foránea se elige
    // buscando en la tabla destino.
    await expect(
      form.field('type').getByTestId('record-field-select'),
    ).toContainText('info');

    await form.pickRelation('account_id', 'PymeKit', TEAM_ACCOUNT_ID);
    await form.fill('body', body);
    await form.submit().click();

    // Al guardar se abre la ficha del registro creado.
    await page.waitForURL(`**/${NOTIFICATIONS_PATH}/record/*`);
    await expect(record.recordPage()).toBeVisible();
    await expect(record.fieldValue('body')).toContainText(body);

    const id = page.url().split('/').pop()!;

    // Y aparece en el listado.
    await explorer.goto('public', 'notifications', bodyFilter(body));
    await expect(explorer.rows()).toHaveCount(1);

    await expectAuditLog(page, 'INSERT', id);
  });

  test('edita un campo y el cambio se ve en la ficha', async ({ page }) => {
    const form = new RecordFormPageObject(page);
    const record = new RecordPageObject(page);
    const [id] = await seedNotifications([`${RUN_ID}-edit`]);

    await record.goto(`${NOTIFICATIONS_PATH}/record/${id}`);
    await record.waitForHydration();
    await expect(record.fieldValue('dismissed')).toContainText('No');

    await form.editButton().click();
    await page.waitForURL(`**/${NOTIFICATIONS_PATH}/record/${id}/edit`);
    await form.waitForForm();

    // Sin cambios no se puede guardar; al cambiar algo, se avisa.
    await expect(form.submit()).toBeDisabled();
    await form.toggleSwitch('dismissed');
    await expect(page.getByTestId('record-form-unsaved')).toBeVisible();

    await form.submit().click();

    await page.waitForURL(`**/${NOTIFICATIONS_PATH}/record/${id}`);
    await expect(record.fieldValue('dismissed')).toContainText('Yes');

    await expectAuditLog(page, 'UPDATE', id!);
  });

  test('un rechazo de la base de datos llega como error controlado', async ({
    page,
  }) => {
    const form = new RecordFormPageObject(page);
    const [id] = await seedNotifications([`${RUN_ID}-rule`]);

    await page.goto(
      `/admin/cms/resources/${NOTIFICATIONS_PATH}/record/${id}/edit`,
    );
    await form.waitForForm();

    // El trigger de `notifications` solo permite cambiar `dismissed`.
    await form.fill('body', `${RUN_ID}-rule-changed`);

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/record/conditions') &&
        response.request().method() === 'PUT',
    );

    await form.submit().click();

    const response = await responsePromise;
    const text = await response.text();

    expect(response.status()).toBe(400);
    expect(JSON.parse(text)).toMatchObject({
      errorCode: 'RECORD_RULE_VIOLATION',
    });

    // Ni el SQLSTATE ni el mensaje del trigger salen del servidor.
    expect(text).not.toContain('SQLSTATE');
    expect(text).not.toContain('dismissed');

    // El usuario sigue en el formulario, con sus cambios.
    await expect(form.formPage()).toBeVisible();
    await expect(form.input('body')).toHaveValue(`${RUN_ID}-rule-changed`);
  });

  test('borra un registro desde la ficha', async ({ page }) => {
    const explorer = new DataExplorerPageObject(page);
    const form = new RecordFormPageObject(page);
    const record = new RecordPageObject(page);
    const body = `${RUN_ID}-delete`;
    const [id] = await seedNotifications([body]);

    await record.goto(`${NOTIFICATIONS_PATH}/record/${id}`);
    await record.waitForHydration();

    await form.confirmDelete();

    // Tras borrar se vuelve al listado.
    await page.waitForURL((url) =>
      url.pathname.endsWith(`/${NOTIFICATIONS_PATH}`),
    );

    await explorer.goto('public', 'notifications', bodyFilter(body));
    await expect(page.getByTestId('data-explorer-empty')).toBeVisible();

    await expectAuditLog(page, 'DELETE', id!);
  });

  test('borra dos registros a la vez desde el listado', async ({ page }) => {
    const explorer = new DataExplorerPageObject(page);
    const form = new RecordFormPageObject(page);
    const marker = `${RUN_ID}-batch`;

    await seedNotifications([`${marker}-1`, `${marker}-2`]);

    await explorer.goto('public', 'notifications', bodyFilter(marker));
    await expect(explorer.rows()).toHaveCount(2);

    // La casilla de la cabecera selecciona la página visible.
    await form.selectAllRows().click();
    await expect(form.batchDeleteButton()).toHaveAttribute('data-count', '2');

    await form.confirmBatchDelete();

    await expect(page.getByTestId('data-explorer-empty')).toBeVisible();
    await expect(form.batchDeleteButton()).toHaveCount(0);
  });

  test('crea un registro relacionado desde la sección uno a muchos', async ({
    page,
  }) => {
    const form = new RecordFormPageObject(page);
    const record = new RecordPageObject(page);
    const body = `${RUN_ID}-related`;

    await record.goto(`public/accounts/record/${SUPER_ADMIN_ACCOUNT_ID}`);
    await record.waitForHydration();

    const section = record.relatedSection('public.notifications');

    await expect(section).toHaveAttribute('data-count', /\d+/);
    const before = Number(await section.getAttribute('data-count'));

    await section.getByTestId('create-related-record-button').click();

    const dialog = page.getByTestId('create-related-record-dialog');
    await expect(dialog).toBeVisible();

    // La clave foránea queda fijada al registro padre: no se muestra.
    await expect(form.field('account_id')).toHaveCount(0);

    await form.fill('body', body);
    await dialog.getByTestId('create-related-record-submit').click();

    await expect(dialog).toBeHidden();
    await expect(section).toHaveAttribute('data-count', String(before + 1));

    // Y la notificación creada apunta a la cuenta.
    const { data } = await getAdminClient()
      .from('notifications')
      .select('account_id')
      .eq('body', body);

    expect(data).toEqual([{ account_id: SUPER_ADMIN_ACCOUNT_ID }]);
  });

  test('editar o borrar exige la clave del registro, no cualquier columna', async ({
    page,
  }) => {
    const cms = new CmsPageObject(page);
    const marker = `${RUN_ID}-key`;
    const [first] = await seedNotifications([marker, marker]);

    await page.goto('/admin/cms');

    // `body` no es clave: estas condiciones coinciden con dos filas y la API
    // las rechaza en lugar de cambiar o borrar ambas.
    const base = `/api/cms/v1/tables/${NOTIFICATIONS_PATH}`;

    const responses = await Promise.all([
      page.request.put(`${base}/record/conditions`, {
        data: { conditions: { body: marker }, data: { dismissed: true } },
      }),
      page.request.delete(`${base}/record/conditions`, {
        data: { conditions: { body: marker } },
      }),
      page.request.delete(`${base}/records`, {
        data: { items: [{ body: marker }] },
      }),
    ]);

    for (const response of responses) {
      expect(response.status()).toBe(400);
      expect(await response.json()).toMatchObject({
        errorCode: 'RECORD_INVALID_DATA',
      });
    }

    const { data } = await getAdminClient()
      .from('notifications')
      .select('dismissed')
      .eq('body', marker);

    expect(data).toEqual([{ dismissed: false }, { dismissed: false }]);

    // Tampoco se abre la página de edición con esas columnas en la URL.
    await page.goto(
      `/admin/cms/resources/${NOTIFICATIONS_PATH}/record/edit?body=${marker}`,
    );
    await expect(cms.notFound()).toBeVisible();

    // Con la clave primaria sí se abre.
    await page.goto(
      `/admin/cms/resources/${NOTIFICATIONS_PATH}/record/edit?id=${first}`,
    );
    await expect(page.getByTestId('record-form-page')).toBeVisible();
  });

  test('la API rechaza una escritura con formato de formulario de otro origen (CSRF)', async ({
    page,
  }) => {
    await page.goto('/admin/cms');

    // Un formulario HTML de otra web solo puede enviar `text/plain`,
    // `multipart/form-data` o `application/x-www-form-urlencoded`: el filtro
    // CSRF de la API lo rechaza antes de llegar a la ruta.
    const response = await page.request.post(
      `/api/cms/v1/tables/${NOTIFICATIONS_PATH}/record`,
      {
        headers: {
          'content-type': 'text/plain',
          origin: 'https://attacker.example',
        },
        data: JSON.stringify({
          account_id: TEAM_ACCOUNT_ID,
          body: `${RUN_ID}-csrf`,
        }),
      },
    );

    expect(response.status()).toBe(403);

    const { data } = await getAdminClient()
      .from('notifications')
      .select('id')
      .eq('body', `${RUN_ID}-csrf`);

    expect(data).toEqual([]);
  });
});

test.describe('Escrituras del explorador: personal de soporte (solo lectura)', () => {
  AuthPageObject.setupSession(AUTH_STATES.CMS_STAFF);

  test('no ve acciones de escritura en public.accounts', async ({ page }) => {
    const cms = new CmsPageObject(page);
    const explorer = new DataExplorerPageObject(page);
    const form = new RecordFormPageObject(page);
    const record = new RecordPageObject(page);

    await explorer.goto('public', 'accounts');
    await expect(explorer.rows().first()).toBeVisible();

    await expect(form.createLink()).toHaveCount(0);
    await expect(form.selectAllRows()).toHaveCount(0);
    await expect(form.inlineEditButtons()).toHaveCount(0);

    await record.goto(`public/accounts/record/${TEAM_ACCOUNT_ID}`);
    await record.waitForHydration();

    await expect(form.editButton()).toHaveCount(0);
    await expect(form.deleteButton()).toHaveCount(0);

    // Escribir la URL de las páginas de escritura tampoco sirve.
    await page.goto('/admin/cms/resources/public/accounts/new');
    await expect(cms.notFound()).toBeVisible();

    await page.goto(
      `/admin/cms/resources/public/accounts/record/${TEAM_ACCOUNT_ID}/edit`,
    );
    await expect(cms.notFound()).toBeVisible();
  });

  test('la API responde 403 a crear, editar y borrar', async ({ page }) => {
    await page.goto('/admin/cms');

    const readName = async () =>
      (
        await getAdminClient()
          .from('accounts')
          .select('name')
          .eq('id', TEAM_ACCOUNT_ID)
          .single()
      ).data?.name;

    const nameBefore = await readName();

    const base = '/api/cms/v1/tables/public/accounts';

    // Peticiones JSON del mismo origen: pasan el filtro CSRF y llegan a la
    // comprobación de permisos de la ruta, que responde con su código.
    const responses = await Promise.all([
      page.request.post(`${base}/record`, {
        data: { name: `${RUN_ID}-staff` },
      }),
      page.request.put(`${base}/record/conditions`, {
        data: {
          conditions: { id: TEAM_ACCOUNT_ID },
          data: { name: `${RUN_ID}-staff` },
        },
      }),
      page.request.delete(`${base}/record/conditions`, {
        data: { conditions: { id: TEAM_ACCOUNT_ID } },
      }),
      page.request.delete(`${base}/records`, {
        data: { items: [{ id: TEAM_ACCOUNT_ID }] },
      }),
    ]);

    for (const response of responses) {
      expect(response.status()).toBe(403);
      expect(await response.json()).toMatchObject({
        errorCode: 'RECORD_PERMISSION_DENIED',
      });
    }

    // La cuenta sigue intacta.
    expect(await readName()).toBe(nameBefore);
  });
});
