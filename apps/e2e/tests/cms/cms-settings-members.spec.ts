import { createClient } from '@supabase/supabase-js';

/**
 * Pruebas E2E de Ajustes > Miembros del CMS (F2.7a).
 *
 * Con el super-admin (cuenta raíz, sesión con MFA):
 *  - lista los miembros, busca a `cms-staff` y abre su ficha (rol «Soporte»,
 *    estado y registro de auditoría);
 *  - ciclo completo sobre un miembro TEMPORAL: asignar y quitar un rol,
 *    desactivar y reactivar, y ver en su propio registro las entradas que
 *    dejan esos cambios. Se usa un miembro creado para la prueba (y borrado
 *    al final) en lugar de `cms-staff` porque las pruebas se ejecutan en
 *    paralelo: desactivar o quitar el rol al usuario de soporte del *seed*
 *    haría fallar a la vez las demás pruebas que entran con él;
 *  - su propia ficha no ofrece acciones sobre sí mismo y la API rechaza
 *    cambiar su propio rol (`MEMBER_SELF_ACTION`).
 *
 * Con el personal de soporte (sin `account:select` ni permisos de rol):
 *  - no ve la pestaña, las URL responden «no encontrado» y la API, 403 con
 *    su código, incluido el intento de cambiar su propio rol.
 *
 * [TFG] RF-09 · RF-10 · RNF-02 · ADR-014.
 */
import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { SettingsPageObject } from './settings.po';

/** Cuenta del CMS de `cms-staff@pymekit.test` (ver el *seed*). */
const CMS_STAFF_ACCOUNT_ID = '6a0f3e2d-1c4b-4a59-8e7d-3b2c1a0f9e8d';

/** Rol «Soporte» del *seed* (rango 30). */
const SUPPORT_ROLE_ID = '9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e';

const RUN_ID = `e2e-cms-members-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;

/** Cliente con la clave de servicio del Supabase local (ignora RLS). */
function getAdminClient() {
  return createClient(
    'http://127.0.0.1:54321',
    'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz',
  );
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

test.describe('Ajustes > Miembros: super-admin con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('lista los miembros y abre la ficha del personal de soporte', async ({
    page,
  }) => {
    const settings = new SettingsPageObject(page);

    await settings.gotoMembers();
    await expect(settings.memberRows().first()).toBeVisible();

    await page.getByTestId('members-search-input').fill('cms-staff@');
    await page.getByTestId('members-search-input').press('Enter');
    await page.waitForURL(/search=cms-staff/);

    await expect(settings.memberRows()).toHaveCount(1);
    await expect(page.getByTestId('member-email')).toHaveText(
      'cms-staff@pymekit.test',
    );
    await expect(page.getByTestId('member-role')).toHaveText('Soporte');

    await settings.memberRows().first().click();
    await page.waitForURL(
      `**/admin/cms/settings/members/${CMS_STAFF_ACCOUNT_ID}`,
    );
    await settings.waitForHydration('member-details');

    await expect(page.getByTestId('member-details-email')).toContainText(
      'cms-staff@pymekit.test',
    );
    await expect(page.getByTestId('member-details-role')).toContainText(
      'Soporte',
    );
    await expect(page.getByTestId('member-status')).toHaveAttribute(
      'data-status',
      'active',
    );
    // Root puede gestionarla: se ofrecen las acciones.
    await expect(page.getByTestId('member-manage-role')).toBeVisible();
    await expect(page.getByTestId('member-deactivate')).toBeVisible();
    // Y su registro de auditoría (Root puede leer el de rangos inferiores).
    await expect(page.getByTestId('member-audit-logs-table')).toBeVisible();
  });

  test('asigna y quita un rol y desactiva y reactiva a un miembro', async ({
    page,
  }) => {
    const settings = new SettingsPageObject(page);
    const email = `${RUN_ID}-member@pymekit.test`;

    // Miembro temporal: usuario de Auth creado con la clave de servicio y
    // acceso al CMS concedido por la API (así se crea su cuenta del CMS).
    const { data: created, error } =
      await getAdminClient().auth.admin.createUser({
        email,
        password: 'Passw0rdE2E',
        email_confirm: true,
      });

    expect(error).toBeNull();

    const grant = await page.request.put(
      `/api/cms/v1/admin/users/${created.user!.id}/admin-access`,
      { data: { adminAccess: true } },
    );

    expect(grant.status()).toBe(200);

    const list = await page.request.get(
      `/api/cms/v1/members?search=${encodeURIComponent(email)}`,
    );
    const members = (await list.json()) as { members: Array<{ id: string }> };

    expect(members.members).toHaveLength(1);

    const memberId = members.members[0]!.id;

    await settings.gotoMember(memberId);
    await expect(page.getByTestId('member-details-role')).toHaveText('Sin rol');

    // Asignar el rol «Soporte».
    await page.getByTestId('member-manage-role').click();
    await expect(page.getByTestId('member-role-dialog')).toBeVisible();
    await page.getByTestId('member-role-select').selectOption(SUPPORT_ROLE_ID);
    await page.getByTestId('member-role-save').click();
    await expect(page.getByTestId('member-role-dialog')).toBeHidden();
    await expect(page.getByTestId('member-details-role')).toContainText(
      'Soporte',
    );

    // Quitarlo.
    await page.getByTestId('member-manage-role').click();
    await page.getByTestId('member-role-select').selectOption('');
    await page.getByTestId('member-role-save').click();
    await expect(page.getByTestId('member-role-dialog')).toBeHidden();
    await expect(page.getByTestId('member-details-role')).toHaveText('Sin rol');

    // Desactivar (con confirmación) y reactivar.
    await page.getByTestId('member-deactivate').click();
    await page.getByTestId('member-status-confirm').click();
    await expect(page.getByTestId('member-status')).toHaveAttribute(
      'data-status',
      'inactive',
    );
    // Una cuenta desactivada sin rol no admite cambios de rol: no se ofrece.
    await expect(page.getByTestId('member-manage-role')).toHaveCount(0);

    await page.getByTestId('member-activate').click();
    await page.getByTestId('member-status-confirm').click();
    await expect(page.getByTestId('member-status')).toHaveAttribute(
      'data-status',
      'active',
    );

    // Los cambios quedan en la auditoría (asignación y retirada del rol),
    // atribuidos al super-admin. Se consulta por la API filtrando por la
    // tabla, porque la primera página del registro del super-admin puede
    // llenarse con lo que hacen a la vez otras pruebas.
    await expect
      .poll(async () => {
        const response = await page.request.get(
          '/api/cms/v1/audit-logs?table=account_roles&limit=50',
        );
        const body = (await response.json()) as {
          logs: Array<{ operation: string; recordId: string | null }>;
        };

        return body.logs
          .filter((log) => log.recordId?.startsWith(memberId))
          .map((log) => log.operation)
          .sort();
      })
      .toEqual(['DELETE', 'INSERT']);

    // Su propia ficha: sin acciones sobre sí mismo y con su registro.
    await settings.gotoMembers('?search=super-admin%40pymekit.test');
    await settings.memberRows().first().click();
    await settings.waitForHydration('member-details');

    await expect(page.getByTestId('member-details-no-actions')).toBeVisible();
    await expect(page.getByTestId('member-manage-role')).toHaveCount(0);
    await expect(page.getByTestId('member-audit-logs-table')).toBeVisible();
  });

  test('no puede cambiar su propio rol por la API', async ({ page }) => {
    const list = await page.request.get(
      '/api/cms/v1/members?search=super-admin%40pymekit.test',
    );
    const [self] = (
      (await list.json()) as {
        members: Array<{ id: string; role: { id: string } | null }>;
      }
    ).members;

    expect(self).toBeDefined();

    const response = await page.request.post(
      `/api/cms/v1/members/${self!.id}/roles`,
      { data: { rolesToAdd: [], rolesToRemove: [self!.role!.id] } },
    );

    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({
      errorCode: 'MEMBER_SELF_ACTION',
    });
  });
});

test.describe('Ajustes > Miembros: personal de soporte', () => {
  AuthPageObject.setupSession(AUTH_STATES.CMS_STAFF);

  test('no ve la pestaña y las URL responden «no encontrado»', async ({
    page,
  }) => {
    const settings = new SettingsPageObject(page);

    await settings.gotoGeneral();
    await expect(settings.tab('members')).toHaveCount(0);

    await page.goto('/admin/cms/settings/members');
    await expect(settings.notFound()).toBeVisible();

    await page.goto(`/admin/cms/settings/members/${CMS_STAFF_ACCOUNT_ID}`);
    await expect(settings.notFound()).toBeVisible();
  });

  test('la API le responde 403 con su código, también sobre su propio rol', async ({
    page,
  }) => {
    const list = await page.request.get('/api/cms/v1/members');

    expect(list.status()).toBe(403);
    expect(await list.json()).toMatchObject({
      errorCode: 'MEMBER_PERMISSION_DENIED',
    });

    // Quitarse su rol «Soporte» o darse otro: rechazado.
    const ownRole = await page.request.post(
      `/api/cms/v1/members/${CMS_STAFF_ACCOUNT_ID}/roles`,
      { data: { rolesToAdd: [], rolesToRemove: [SUPPORT_ROLE_ID] } },
    );

    expect(ownRole.status()).toBe(403);
    expect(await ownRole.json()).toMatchObject({
      errorCode: 'MEMBER_PERMISSION_DENIED',
    });

    // Sin cuerpo JSON, el filtro CSRF de la API exige la cabecera `Origin`
    // (la que enviaría el navegador).
    const deactivateSelf = await page.request.post(
      `/api/cms/v1/members/${CMS_STAFF_ACCOUNT_ID}/deactivate`,
      { headers: { origin: 'http://localhost:3100' } },
    );

    expect(deactivateSelf.status()).toBe(403);
    expect(await deactivateSelf.json()).toMatchObject({
      errorCode: 'MEMBER_SELF_ACTION',
    });
  });
});
