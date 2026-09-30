import { createClient } from '@supabase/supabase-js';

/**
 * Pruebas E2E de Ajustes > Permisos del CMS (F2.7b): roles, grupos de
 * permisos y permisos.
 *
 * Con el super-admin (cuenta raíz, sesión con MFA):
 *  - ciclo completo desde la interfaz: crear un rol de rango inferior a
 *    Root, un grupo y un permiso de datos de lectura sobre `demo.products`,
 *    meter el permiso en el grupo y el grupo en el rol;
 *  - asignar el rol a un miembro TEMPORAL (creado en la prueba), iniciar
 *    sesión como él con su propio segundo factor y comprobar por la API
 *    que puede leer `demo.products` y nada más (ni otras tablas de la demo
 *    ni las secciones con permiso propio);
 *  - limpiar todo al final (miembro, rol, grupo y permiso);
 *  - los objetos de sistema (rol Root, grupo Super Admin) no se pueden
 *    tocar ni desde la API, y no se crean roles de rango igual o superior
 *    al propio ni permisos de almacenamiento sin *bucket* explícito.
 *
 * Con el personal de soporte (sin permisos `role` ni `permission`):
 *  - no ve la pestaña, las URL responden «no encontrado» y la API, 403 con
 *    su código, también al intentar crear un rol de rango alto.
 *
 * [TFG] RF-09 · RNF-02 · ADR-014 · ADR-015.
 */
import {
  type APIRequestContext,
  type Browser,
  expect,
  test,
} from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { SettingsPageObject } from './settings.po';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SECRET_KEY = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';
const PUBLISHABLE_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const MEMBER_PASSWORD = 'Passw0rdE2E-rbac';

/** Rol «Soporte» del *seed* (rango 30). */
const SUPPORT_ROLE_ID = '9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e';

const RUN_ID = `e2e-cms-rbac-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;

/** Cliente con la clave de servicio del Supabase local (ignora RLS). */
function getAdminClient() {
  return createClient(SUPABASE_URL, SECRET_KEY);
}

/** Ids creados por la prueba que siguen existiendo (para la limpieza). */
const created: { role?: string; group?: string; permission?: string } = {};

/**
 * Borra con la API (sesión del super-admin) lo que siga en `created`, en
 * orden: rol (ya sin miembros), grupo (sin roles que lo usen) y permiso
 * (sin grupos). Devuelve los estados HTTP para que la prueba los compruebe.
 */
async function deleteCreated(request: APIRequestContext) {
  // Sin cuerpo, el filtro CSRF de la API exige la cabecera `Origin`.
  const headers = { origin: 'http://localhost:3100' };
  const statuses: number[] = [];
  const paths = [
    created.role && `/api/cms/v1/permissions/roles/${created.role}`,
    created.group && `/api/cms/v1/permissions/groups/${created.group}`,
    created.permission && `/api/cms/v1/permissions/${created.permission}`,
  ];

  for (const path of paths) {
    if (path) {
      statuses.push((await request.delete(path, { headers })).status());
    }
  }

  created.role = created.group = created.permission = undefined;

  return statuses;
}

/** Borra los usuarios de Auth de esta ejecución (y, en cascada, su cuenta del CMS). */
async function deleteRunUsers() {
  const client = getAdminClient();
  const { data } = await client.auth.admin.listUsers({ perPage: 1000 });

  for (const user of data?.users ?? []) {
    if (user.email?.startsWith(RUN_ID)) {
      await client.auth.admin.deleteUser(user.id);
    }
  }
}

// Red de seguridad: si la prueba falla a medias (o agota el tiempo), no se
// quedan el miembro temporal ni el rol, el grupo o el permiso.
test.afterAll(async ({ browser }) => {
  await deleteRunUsers();

  const context = await browser.newContext({
    storageState: AUTH_STATES.SUPER_ADMIN,
  });

  try {
    await deleteCreated(context.request);
  } finally {
    await context.close();
  }
});

/** Extrae el UUID final de la URL de una ficha. */
function idFromUrl(url: string) {
  const match = url.match(/([0-9a-f-]{36})\/?$/);

  expect(match, `URL sin id: ${url}`).not.toBeNull();

  return match![1]!;
}

/**
 * Crea un usuario de Auth y le da un segundo factor TOTP verificado
 * iniciando sesión con la clave pública, como haría la propia web. Devuelve
 * el secreto TOTP y la ventana de 30 s en la que se usó el primer código.
 */
async function createMemberWithMfa(email: string) {
  const { data: created, error } = await getAdminClient().auth.admin.createUser(
    {
      email,
      password: MEMBER_PASSWORD,
      email_confirm: true,
    },
  );

  expect(error).toBeNull();

  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const signIn = await client.auth.signInWithPassword({
    email,
    password: MEMBER_PASSWORD,
  });

  expect(signIn.error).toBeNull();

  const enrolled = await client.auth.mfa.enroll({ factorType: 'totp' });

  expect(enrolled.error).toBeNull();

  const secret = enrolled.data!.totp.secret;
  const { TOTP } = await import('totp-generator');
  const { otp } = await TOTP.generate(secret, { period: 30 });

  const verified = await client.auth.mfa.challengeAndVerify({
    factorId: enrolled.data!.id,
    code: otp,
  });

  expect(verified.error).toBeNull();

  return {
    userId: created.user!.id,
    secret,
    usedWindow: Math.floor(Date.now() / 30_000),
  };
}

/**
 * Inicia sesión en un contexto de navegador nuevo como el miembro temporal,
 * con su segundo factor. Espera a la siguiente ventana TOTP si el código
 * actual ya se usó al activar el factor.
 */
async function loginAsMember(
  browser: Browser,
  params: { email: string; secret: string; usedWindow: number },
) {
  // Sin la sesión del super-admin: en Playwright Test, `newContext()`
  // hereda el `storageState` de `test.use`.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  const auth = new AuthPageObject(page);

  await auth.loginAsUser({
    email: params.email,
    password: MEMBER_PASSWORD,
    next: '/auth/verify',
  });

  if (Math.floor(Date.now() / 30_000) === params.usedWindow) {
    await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 500);
  }

  await auth.submitMFAVerification(params.secret);
  await expect(page).not.toHaveURL(/\/auth\/verify/, { timeout: 15_000 });

  return { context, page };
}

test.describe('Ajustes > Permisos: super-admin con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('crea rol, grupo y permiso, los asigna y el miembro solo gana demo.products', async ({
    page,
    browser,
  }) => {
    // Incluye iniciar sesión como otro usuario con su segundo factor.
    test.setTimeout(180_000);

    const settings = new SettingsPageObject(page);
    const memberEmail = `${RUN_ID}-member@pymekit.test`;

    // Rango libre por debajo de Root (el rango es único).
    const overview = await page.request.get('/api/cms/v1/permissions');

    expect(overview.status()).toBe(200);

    const taken = new Set(
      ((await overview.json()) as { roles: Array<{ rank: number }> }).roles.map(
        (role) => role.rank,
      ),
    );
    const freeRanks = Array.from(
      { length: 60 },
      (_, index) => 40 + index,
    ).filter((rank) => !taken.has(rank));
    const rank = freeRanks[Math.floor(Math.random() * freeRanks.length)]!;

    // 1 · Rol desde la interfaz.
    await settings.gotoPermissions('roles');
    await page.getByTestId('rbac-create-role').click();
    await expect(page.getByTestId('role-form-dialog')).toBeVisible();
    await page.getByTestId('role-form-name').fill(`${RUN_ID} rol`);
    await page.getByTestId('role-form-description').fill('Rol temporal E2E');
    await page.getByTestId('role-form-rank').selectOption(String(rank));
    await page.getByTestId('role-form-submit').click();
    await page.waitForURL(
      /\/admin\/cms\/settings\/permissions\/roles\/[0-9a-f-]{36}$/,
    );
    created.role = idFromUrl(page.url());
    await settings.waitForHydration('role-details');
    await expect(page.getByTestId('role-details-rank')).toHaveText(
      String(rank),
    );

    // 2 · Grupo.
    await settings.gotoPermissions('groups');
    await page.getByTestId('rbac-create-group').click();
    await page.getByTestId('group-form-name').fill(`${RUN_ID} grupo`);
    await page.getByTestId('group-form-submit').click();
    await page.waitForURL(
      /\/admin\/cms\/settings\/permissions\/groups\/[0-9a-f-]{36}$/,
    );
    created.group = idFromUrl(page.url());

    // 3 · Permiso de datos: leer demo.products (selectores del catálogo).
    await settings.gotoPermissions('permissions');
    await page.getByTestId('rbac-create-permission').click();
    await expect(page.getByTestId('permission-form-dialog')).toBeVisible();
    await page.getByTestId('permission-form-name').fill(`${RUN_ID} productos`);
    await page.getByTestId('permission-form-kind').selectOption('table');
    await page.getByTestId('permission-form-schema').selectOption('demo');
    await page.getByTestId('permission-form-table').selectOption('products');
    await page.getByTestId('permission-form-action').selectOption('select');
    await page.getByTestId('permission-form-submit').click();
    await page.waitForURL(
      /\/admin\/cms\/settings\/permissions\/[0-9a-f-]{36}$/,
    );
    created.permission = idFromUrl(page.url());
    await settings.waitForHydration('permission-details');
    await expect(page.getByTestId('permission-details-summary')).toContainText(
      'demo.products',
    );

    // 4 · El permiso entra en el grupo…
    await page.goto(`/admin/cms/settings/permissions/groups/${created.group}`);
    await settings.waitForHydration('group-details');
    await page.getByTestId('group-add-permissions').click();
    await settings.assign(created.permission, /\/groups\/[^/]+\/permissions$/);
    await expect(
      page.locator(
        `[data-testid="group-permissions-item"][data-item-id="${created.permission}"]`,
      ),
    ).toBeVisible();

    // … y el grupo, en el rol.
    await page.goto(`/admin/cms/settings/permissions/roles/${created.role}`);
    await settings.waitForHydration('role-details');
    await page.getByTestId('role-add-groups').click();
    await settings.assign(created.group, /\/roles\/[^/]+\/groups$/);
    await expect(
      page.locator(
        `[data-testid="role-groups-item"][data-item-id="${created.group}"]`,
      ),
    ).toBeVisible();

    // 5 · Miembro temporal con el rol nuevo.
    const member = await createMemberWithMfa(memberEmail);

    const grant = await page.request.put(
      `/api/cms/v1/admin/users/${member.userId}/admin-access`,
      { data: { adminAccess: true } },
    );

    expect(grant.status()).toBe(200);

    const list = await page.request.get(
      `/api/cms/v1/members?search=${encodeURIComponent(memberEmail)}`,
    );
    const [account] = (
      (await list.json()) as { members: Array<{ id: string }> }
    ).members;

    expect(account).toBeDefined();

    const assignRole = await page.request.post(
      `/api/cms/v1/members/${account!.id}/roles`,
      { data: { rolesToAdd: [created.role], rolesToRemove: [] } },
    );

    expect(assignRole.status()).toBe(200);

    // La ficha del rol muestra ahora al miembro.
    await page.reload();
    await settings.waitForHydration('role-details');
    await expect(
      page.locator(
        `[data-testid="role-members-item"][data-item-id="${account!.id}"]`,
      ),
    ).toBeVisible();
    // Con miembros no se ofrece borrarlo.
    await expect(page.getByTestId('role-delete')).toHaveCount(0);

    // 6 · Sesión del miembro (aal2): lee demo.products y nada más.
    const { context } = await loginAsMember(browser, {
      email: memberEmail,
      secret: member.secret,
      usedWindow: member.usedWindow,
    });

    try {
      const api = context.request;

      const navigation = await api.get('/api/cms/v1/navigation');

      expect(navigation.status()).toBe(200);
      expect(
        (
          (await navigation.json()) as Array<{
            schemaName: string;
            tableName: string;
          }>
        ).map((item) => `${item.schemaName}.${item.tableName}`),
      ).toEqual(['demo.products']);

      const products = await api.get('/api/cms/v1/tables/demo/products');

      expect(products.status()).toBe(200);

      const customers = await api.get('/api/cms/v1/tables/demo/customers');

      expect(customers.status()).toBe(403);

      const account = await api.get('/api/cms/v1/account');
      const { access } = (await account.json()) as {
        access: Record<string, boolean>;
      };

      expect(access).toEqual({
        users: false,
        storage: false,
        auditLogs: false,
        members: false,
        systemSettings: false,
        permissions: false,
      });

      // Tampoco gestiona el RBAC.
      const rbac = await api.get('/api/cms/v1/permissions');

      expect(rbac.status()).toBe(403);
      expect(await rbac.json()).toMatchObject({
        errorCode: 'PERMISSION_ACCESS_DENIED',
      });
    } finally {
      await context.close();
    }

    // 7 · Limpieza: el miembro (su cuenta del CMS se borra en cascada) y,
    // con la API, el rol, el grupo y el permiso, ya sin nada que los use.
    await deleteRunUsers();
    expect(await deleteCreated(page.request)).toEqual([200, 200, 200]);
  });

  test('los objetos de sistema son inmutables y no hay escalada de rango', async ({
    page,
  }) => {
    const settings = new SettingsPageObject(page);
    const overview = (await (
      await page.request.get('/api/cms/v1/permissions')
    ).json()) as {
      roles: Array<{ id: string; isSystem: boolean }>;
      groups: Array<{ id: string; isSystem: boolean }>;
      permissions: Array<{ id: string; isSystem: boolean }>;
      access: { maxRank: number };
    };

    const rootRole = overview.roles.find((role) => role.isSystem)!;
    const rootGroup = overview.groups.find((group) => group.isSystem)!;
    const rootPermission = overview.permissions.find(
      (permission) => permission.isSystem,
    )!;

    expect(overview.access.maxRank).toBe(100);

    // La ficha del rol Root no ofrece acciones.
    await page.goto(`/admin/cms/settings/permissions/roles/${rootRole.id}`);
    await settings.waitForHydration('role-details');
    await expect(page.getByTestId('role-system-notice')).toBeVisible();
    await expect(page.getByTestId('role-edit')).toHaveCount(0);
    await expect(page.getByTestId('role-delete')).toHaveCount(0);
    await expect(page.getByTestId('role-add-groups')).toHaveCount(0);

    // Tampoco la API, ni siquiera para otro super-admin.
    const renameRole = await page.request.patch(
      `/api/cms/v1/permissions/roles/${rootRole.id}`,
      { data: { name: 'Hacked' } },
    );

    expect(renameRole.status()).toBe(403);
    expect(await renameRole.json()).toMatchObject({
      errorCode: 'ROLE_SYSTEM_PROTECTED',
    });

    const renameGroup = await page.request.patch(
      `/api/cms/v1/permissions/groups/${rootGroup.id}`,
      { data: { name: 'Hacked' } },
    );

    expect(renameGroup.status()).toBe(403);
    expect(await renameGroup.json()).toMatchObject({
      errorCode: 'GROUP_SYSTEM_PROTECTED',
    });

    const deletePermission = await page.request.delete(
      `/api/cms/v1/permissions/${rootPermission.id}`,
      { headers: { origin: 'http://localhost:3100' } },
    );

    expect(deletePermission.status()).toBe(403);
    expect(await deletePermission.json()).toMatchObject({
      errorCode: 'PERMISSION_SYSTEM_PROTECTED',
    });

    // El grupo de sistema no se cuelga de otro rol (sería otro Root).
    const attachRootGroup = await page.request.put(
      `/api/cms/v1/permissions/roles/${SUPPORT_ROLE_ID}/groups`,
      { data: { toAdd: [rootGroup.id], toRemove: [] } },
    );

    expect(attachRootGroup.status()).toBe(403);
    expect(await attachRootGroup.json()).toMatchObject({
      errorCode: 'GROUP_SYSTEM_PROTECTED',
    });

    // Ningún rol de rango igual o superior al propio (100).
    const peerRole = await page.request.post('/api/cms/v1/permissions/roles', {
      data: { name: `${RUN_ID} peer`, rank: 100 },
    });

    expect(peerRole.status()).toBe(403);
    expect(await peerRole.json()).toMatchObject({
      errorCode: 'ROLE_RANK_DENIED',
    });

    // Las marcas de sistema no entran por `metadata` (esquema estricto).
    const withMetadata = await page.request.post(
      '/api/cms/v1/permissions/roles',
      {
        data: {
          name: `${RUN_ID} fake root`,
          rank: 1,
          metadata: { system_role: 'root' },
        },
      },
    );

    expect(withMetadata.status()).toBe(400);
    expect(await withMetadata.json()).toMatchObject({
      errorCode: 'PERMISSION_INVALID_DATA',
    });

    // Un permiso de almacenamiento sin bucket explícito ya no es un comodín.
    const noBucket = await page.request.post('/api/cms/v1/permissions', {
      data: {
        name: `${RUN_ID} storage`,
        permissionType: 'data',
        scope: 'storage',
        bucketName: '',
        pathPattern: '*',
        action: 'select',
      },
    });

    expect(noBucket.status()).toBe(400);
    expect(await noBucket.json()).toMatchObject({
      errorCode: 'PERMISSION_INVALID_DATA',
    });
  });
});

test.describe('Ajustes > Permisos: personal de soporte', () => {
  AuthPageObject.setupSession(AUTH_STATES.CMS_STAFF);

  test('no ve la pestaña y las URL responden «no encontrado»', async ({
    page,
  }) => {
    const settings = new SettingsPageObject(page);

    await settings.gotoGeneral();
    await expect(settings.tab('permissions')).toHaveCount(0);

    await page.goto('/admin/cms/settings/permissions');
    await expect(settings.notFound()).toBeVisible();

    await page.goto(`/admin/cms/settings/permissions/roles/${SUPPORT_ROLE_ID}`);
    await expect(settings.notFound()).toBeVisible();
  });

  test('la API le responde 403 con su código, también al crear un rol de rango alto', async ({
    page,
  }) => {
    const overview = await page.request.get('/api/cms/v1/permissions');

    expect(overview.status()).toBe(403);
    expect(await overview.json()).toMatchObject({
      errorCode: 'PERMISSION_ACCESS_DENIED',
    });

    const role = await page.request.get(
      `/api/cms/v1/permissions/roles/${SUPPORT_ROLE_ID}`,
    );

    expect(role.status()).toBe(403);
    expect(await role.json()).toMatchObject({
      errorCode: 'PERMISSION_ACCESS_DENIED',
    });

    const highRank = await page.request.post('/api/cms/v1/permissions/roles', {
      data: { name: `${RUN_ID} staff boss`, rank: 99 },
    });

    expect(highRank.status()).toBe(403);
    expect(await highRank.json()).toMatchObject({
      errorCode: 'PERMISSION_ACCESS_DENIED',
    });

    // Tampoco puede colgar grupos de su propio rol ni crear permisos.
    const ownRole = await page.request.put(
      `/api/cms/v1/permissions/roles/${SUPPORT_ROLE_ID}/groups`,
      {
        data: {
          toAdd: ['00000000-0000-4000-8000-000000000000'],
          toRemove: [],
        },
      },
    );

    expect(ownRole.status()).toBe(403);

    const permission = await page.request.post('/api/cms/v1/permissions', {
      data: {
        name: `${RUN_ID} staff perm`,
        permissionType: 'system',
        systemResource: 'role',
        action: '*',
      },
    });

    expect(permission.status()).toBe(403);
    expect(await permission.json()).toMatchObject({
      errorCode: 'PERMISSION_ACCESS_DENIED',
    });
  });
});
