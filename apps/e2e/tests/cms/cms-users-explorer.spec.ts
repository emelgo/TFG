import { createClient } from '@supabase/supabase-js';

/**
 * Pruebas E2E del explorador de usuarios del CMS (F2.5).
 *
 * Con el super-admin (raíz del CMS, sesión con MFA):
 *  - lista y busca usuarios y abre su ficha;
 *  - ciclo completo sobre un usuario de prueba creado desde la interfaz:
 *    bloquear, desbloquear, conceder y retirar el acceso al CMS y borrar;
 *  - la ficha de un usuario protegido (otro super-admin) no ofrece acciones.
 *
 * Seguridad de la API (las acciones usan la clave de servicio de Auth, así
 * que la autorización tiene que estar en el código):
 *  - nadie puede actuar sobre sí mismo ni sobre un super-admin o personal del
 *    CMS, ni siquiera el propio super-admin;
 *  - ningún *endpoint* acepta `app_metadata` (con `role` o `cms_access`): un
 *    campo de más se rechaza con 400;
 *  - el personal de soporte (sin permisos sobre usuarios) no ve la sección y
 *    la API le responde 403 a todo.
 *
 * Cada ejecución usa correos con una marca única y `afterAll` borra con la
 * clave de servicio lo que quede.
 *
 * [TFG] RF-09 · RNF-02 · ADR-014.
 */
import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { CmsPageObject } from './cms.po';
import { UsersExplorerPageObject } from './users-explorer.po';

/** Usuarios del *seed*. */
const SEED_USERS = {
  superAdmin: 'c5b930c9-0a76-412e-a836-4bc4849a3270',
  // Otro super-admin (su sesión en las pruebas es aal1).
  otherSuperAdmin: '31a03e74-1639-45b6-bfa7-77447f1a4762',
  cmsStaff: 'd3c1a6f2-7b54-4e0a-9c8d-2f6e5b4a3c21',
  owner: '5c064f1b-78ee-4e1c-ac3b-e99aa97c99bf',
} as const;

/** Cabecera `Origin` de la web (la que envía el navegador). */
const SAME_ORIGIN = { origin: 'http://localhost:3100' };

const RUN_ID = `e2e-cms-users-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;

/** Cliente con la clave de servicio del Supabase local (ignora RLS). */
function getAdminClient() {
  return createClient(
    'http://127.0.0.1:54321',
    'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz',
  );
}

/** Lee el usuario de Auth con la clave de servicio (o `null` si no existe). */
async function getAuthUser(id: string) {
  const { data } = await getAdminClient().auth.admin.getUserById(id);

  return data.user ?? null;
}

test.afterAll(async () => {
  const client = getAdminClient();
  const { data } = await client.auth.admin.listUsers({ perPage: 1000 });

  for (const user of data?.users ?? []) {
    if (user.email?.startsWith(RUN_ID)) {
      await client.auth.admin.deleteUser(user.id);
    }
  }
});

test.describe('Explorador de usuarios: super-admin con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('lista, busca y abre la ficha de un usuario', async ({ page }) => {
    const users = new UsersExplorerPageObject(page);

    await users.gotoList();
    await expect(users.rows().first()).toBeVisible();

    // Propietario de equipo del *seed* (búsqueda parcial por correo).
    await page.getByTestId('users-search-input').fill('owner@');
    await page.getByTestId('users-search-input').press('Enter');

    await page.waitForURL(/search=owner/);
    await expect(users.emails()).toHaveCount(1);
    await expect(users.emails().first()).toHaveText(/^owner@/);

    await users.rows().first().click();
    await page.waitForURL(`**/admin/cms/users/${SEED_USERS.owner}`);

    await expect(page.getByTestId('user-details-email')).toHaveText(/^owner@/);
    // Es un usuario normal: se ofrecen las acciones.
    await expect(users.action('ban')).toBeVisible();
    await expect(users.action('grantAdminAccess')).toBeVisible();
  });

  test('la ficha de otro super-admin no ofrece ninguna acción', async ({
    page,
  }) => {
    const users = new UsersExplorerPageObject(page);

    await users.gotoUser(SEED_USERS.otherSuperAdmin);

    await expect(page.getByTestId('user-protected-notice')).toBeVisible();
    await expect(page.getByTestId('user-badge-super-admin')).toBeVisible();
    await expect(
      page.getByTestId('user-actions').locator('button'),
    ).toHaveCount(0);
  });

  test('crea, bloquea, desbloquea, da y quita acceso al CMS y borra un usuario', async ({
    page,
  }) => {
    const users = new UsersExplorerPageObject(page);
    const email = `${RUN_ID}-lifecycle@pymekit.test`;

    // Crear desde el menú «Añadir usuario».
    await users.gotoList();
    await page.getByTestId('add-user-button').click();
    await page.getByTestId('create-user-menu-item').click();
    await expect(page.getByTestId('create-user-dialog')).toBeVisible();

    await page.getByTestId('create-user-email').fill(email);
    await page.getByTestId('create-user-password').fill('Passw0rdE2E');
    await page.getByTestId('create-user-submit').click();

    // Al crearlo se abre su ficha.
    await page.waitForURL(/\/admin\/cms\/users\/[0-9a-f-]{36}$/);
    await users.waitForHydration('user-details');
    await expect(page.getByTestId('user-details-email')).toHaveText(email);

    const userId = page.url().split('/').pop()!;

    // Ningún metadato de rol: Auth solo pone el proveedor.
    expect((await getAuthUser(userId))?.app_metadata['role']).toBeUndefined();

    // Bloquear (pide escribir BAN) y desbloquear.
    await users.runAction('ban', 'BLOQUEAR');
    await expect(page.getByTestId('user-status')).toHaveText('Bloqueado');
    expect((await getAuthUser(userId))?.banned_until).toBeTruthy();

    await users.runAction('unban');
    await expect(page.getByTestId('user-status')).toHaveText('Activo');

    // Conceder acceso al CMS: pasa por `cms.grant_admin_access`.
    await users.runAction('grantAdminAccess');
    await expect(page.getByTestId('user-badge-cms-staff')).toBeVisible();
    expect((await getAuthUser(userId))?.app_metadata['cms_access']).toBe(
      'true',
    );

    // Con acceso al CMS queda protegido: no se puede bloquear ni borrar.
    await expect(users.action('ban')).toHaveCount(0);
    await expect(users.action('delete')).toHaveCount(0);

    // Retirarlo (pide escribir REVOKE).
    await users.runAction('revokeAdminAccess', 'REVOCAR');
    await expect(users.action('grantAdminAccess')).toBeVisible();
    expect((await getAuthUser(userId))?.app_metadata['cms_access']).toBe(
      'false',
    );

    // Borrar (pide escribir DELETE) vuelve al listado.
    await users.runAction('delete', 'ELIMINAR');
    await page.waitForURL('**/admin/cms/users');
    expect(await getAuthUser(userId)).toBeNull();
  });
});

test.describe('API del explorador de usuarios: protecciones', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('nadie actúa sobre sí mismo, otro super-admin o personal del CMS', async ({
    page,
  }) => {
    await page.goto('/admin/cms');

    try {
      const cases = [
        {
          url: `/api/cms/v1/admin/users/${SEED_USERS.superAdmin}/ban`,
          errorCode: 'AUTH_USER_SELF_ACTION',
        },
        {
          url: `/api/cms/v1/admin/users/${SEED_USERS.otherSuperAdmin}/ban`,
          errorCode: 'AUTH_USER_PROTECTED',
        },
        {
          url: `/api/cms/v1/admin/users/${SEED_USERS.cmsStaff}/reset-password`,
          errorCode: 'AUTH_USER_PROTECTED',
        },
        {
          url: `/api/cms/v1/admin/users/${SEED_USERS.otherSuperAdmin}/magic-link`,
          errorCode: 'AUTH_USER_PROTECTED',
        },
      ];

      for (const { url, errorCode } of cases) {
        const response = await page.request.post(url, { data: {} });

        expect(response.status(), url).toBe(403);
        expect(await response.json()).toMatchObject({ errorCode });
      }

      const deleteSelf = await page.request.delete(
        `/api/cms/v1/admin/users/${SEED_USERS.superAdmin}`,
        { headers: SAME_ORIGIN },
      );

      expect(deleteSelf.status()).toBe(403);
      expect(await deleteSelf.json()).toMatchObject({
        errorCode: 'AUTH_USER_SELF_ACTION',
      });

      // El acceso al CMS de un super-admin no se toca desde el CMS.
      const revokeSuperAdmin = await page.request.put(
        `/api/cms/v1/admin/users/${SEED_USERS.otherSuperAdmin}/admin-access`,
        { data: { adminAccess: false } },
      );

      expect(revokeSuperAdmin.status()).toBe(403);
      expect(await revokeSuperAdmin.json()).toMatchObject({
        errorCode: 'AUTH_USER_PROTECTED',
      });

      // Nada ha cambiado.
      const other = await getAuthUser(SEED_USERS.otherSuperAdmin);

      expect(
        (other as { banned_until?: string } | null)?.banned_until ?? null,
      ).toBeNull();
      expect(other?.app_metadata['cms_access']).toBe('true');
    } finally {
      // Red de seguridad: si una protección fallara, no dejar al usuario del
      // *seed* bloqueado para el resto de la suite.
      await getAdminClient().auth.admin.updateUserById(
        SEED_USERS.otherSuperAdmin,
        { ban_duration: 'none' },
      );
    }
  });

  test('ningún endpoint acepta app_metadata (rol de super-admin o cms_access)', async ({
    page,
  }) => {
    await page.goto('/admin/cms');

    const email = `${RUN_ID}-escalation@pymekit.test`;

    const createWithRole = await page.request.post(
      '/api/cms/v1/admin/users/create',
      {
        data: {
          email,
          password: 'Passw0rdE2E',
          autoConfirm: true,
          app_metadata: { role: 'super-admin', cms_access: 'true' },
        },
      },
    );

    expect(createWithRole.status()).toBe(400);
    expect(await createWithRole.json()).toMatchObject({
      errorCode: 'AUTH_USER_INVALID_DATA',
    });

    const inviteWithRole = await page.request.post(
      '/api/cms/v1/admin/users/invite',
      { data: { email, data: { role: 'super-admin' } } },
    );

    expect(inviteWithRole.status()).toBe(400);

    const accessWithRole = await page.request.put(
      `/api/cms/v1/admin/users/${SEED_USERS.owner}/admin-access`,
      { data: { adminAccess: false, role: 'super-admin' } },
    );

    expect(accessWithRole.status()).toBe(400);

    // No hay rutas para editar un usuario ni sus metadatos.
    for (const method of ['put', 'patch'] as const) {
      const response = await page.request[method](
        `/api/cms/v1/users/${SEED_USERS.owner}`,
        { data: { app_metadata: { role: 'super-admin' } } },
      );

      expect(response.status()).toBe(404);
    }

    // Ni se ha creado el usuario ni el propietario ha ganado privilegios.
    const { data } = await getAdminClient().auth.admin.listUsers({
      perPage: 1000,
    });

    expect(data.users.some((user) => user.email === email)).toBe(false);

    const owner = await getAuthUser(SEED_USERS.owner);

    expect(owner?.app_metadata['role']).toBeUndefined();
    expect(owner?.app_metadata['cms_access']).toBeUndefined();
  });
});

test.describe('Explorador de usuarios: personal de soporte', () => {
  AuthPageObject.setupSession(AUTH_STATES.CMS_STAFF);

  test('la ficha de un usuario responde 404 sin permiso', async ({ page }) => {
    const cms = new CmsPageObject(page);

    await page.goto(`/admin/cms/users/${SEED_USERS.owner}`);

    await expect(cms.notFound()).toBeVisible();
  });

  test('la API responde 403 a leer y a cualquier acción', async ({ page }) => {
    await page.goto('/admin/cms');

    const requests = [
      page.request.get('/api/cms/v1/users'),
      page.request.get(`/api/cms/v1/users/${SEED_USERS.owner}`),
      // Sin cuerpo, el filtro CSRF exige la cabecera `Origin`, que el
      // navegador siempre envía; aquí se añade a mano.
      page.request.post(`/api/cms/v1/admin/users/${SEED_USERS.owner}/ban`, {
        headers: SAME_ORIGIN,
      }),
      page.request.post(
        `/api/cms/v1/admin/users/${SEED_USERS.owner}/reset-password`,
        { headers: SAME_ORIGIN },
      ),
      page.request.delete(`/api/cms/v1/admin/users/${SEED_USERS.owner}`, {
        headers: SAME_ORIGIN,
      }),
      page.request.post('/api/cms/v1/admin/users/create', {
        data: {
          email: `${RUN_ID}-staff@pymekit.test`,
          password: 'Passw0rdE2E',
          autoConfirm: true,
        },
      }),
      page.request.post('/api/cms/v1/admin/users/delete/batch', {
        data: { userIds: [SEED_USERS.owner] },
      }),
      page.request.put(
        `/api/cms/v1/admin/users/${SEED_USERS.owner}/admin-access`,
        { data: { adminAccess: true } },
      ),
    ];

    for (const response of await Promise.all(requests)) {
      expect(response.status(), response.url()).toBe(403);
      expect(await response.json()).toMatchObject({
        errorCode: 'AUTH_USER_PERMISSION_DENIED',
      });
    }

    // El propietario sigue igual: ni bloqueado, ni borrado, ni con acceso.
    const owner = await getAuthUser(SEED_USERS.owner);

    expect(owner).not.toBeNull();
    expect(owner?.app_metadata['cms_access']).toBeUndefined();
  });

  test('tampoco puede colar app_metadata en la creación', async ({ page }) => {
    await page.goto('/admin/cms');

    const response = await page.request.post('/api/cms/v1/admin/users/create', {
      data: {
        email: `${RUN_ID}-staff-escalation@pymekit.test`,
        password: 'Passw0rdE2E',
        autoConfirm: true,
        app_metadata: { role: 'super-admin' },
      },
    });

    // El esquema estricto la rechaza antes incluso de mirar los permisos.
    expect([400, 403]).toContain(response.status());
  });
});
