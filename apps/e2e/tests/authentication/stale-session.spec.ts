import { createClient } from '@supabase/supabase-js';

import { type BrowserContext, expect, test } from '@playwright/test';

import { AuthPageObject } from './auth.po';

/**
 * Sesión «caducada» en el servidor (F3b).
 *
 * Reproduce lo que le pasaba al autor tras un `supabase db reset` o al
 * revocar una sesión: el navegador conserva cookies con un JWT que todavía
 * no ha caducado, pero la sesión ya no existe en Auth. Antes, `/admin`
 * acababa en un 404 o en un error vacío; ahora la guarda `fetchAuthGate`
 * lo trata como «sin sesión», borra las cookies y redirige al inicio de
 * sesión conservando `next`.
 *
 * Se usa una sesión NUEVA del super-admin (no la del `auth.setup`) y se
 * revoca solo esa (`scope: 'local'`), para no romper el resto de pruebas.
 */
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SECRET_KEY = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';
const AUTH_COOKIE = 'sb-127-auth-token';

/** Lee el `access_token` de la cookie de sesión (puede venir troceada). */
async function readAccessToken(context: BrowserContext) {
  const cookies = await context.cookies();
  const raw = cookies
    .filter(
      (c) => c.name === AUTH_COOKIE || c.name.startsWith(`${AUTH_COOKIE}.`),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
    .map((c) => c.value)
    .join('');

  const json = raw.startsWith('base64-')
    ? Buffer.from(raw.slice('base64-'.length), 'base64url').toString('utf8')
    : decodeURIComponent(raw);

  return (JSON.parse(json) as { access_token: string }).access_token;
}

test.describe('Sesión que ya no existe', () => {
  test('al revocarla, /admin redirige al inicio de sesión y limpia las cookies', async ({
    page,
    context,
  }) => {
    const auth = new AuthPageObject(page);

    await auth.loginAsSuperAdmin({});

    await page.goto('/admin');
    await expect(
      page.getByText('Team Accounts', { exact: true }),
    ).toBeVisible();

    // Revoca en Auth la sesión de este navegador (equivale a borrar su fila
    // de `auth.sessions`); el JWT de la cookie sigue siendo válido.
    const accessToken = await readAccessToken(context);
    const admin = createClient(SUPABASE_URL, SECRET_KEY, {
      auth: { persistSession: false },
    });
    const { error } = await admin.auth.admin.signOut(accessToken, 'local');

    expect(error).toBeNull();

    await page.goto('/admin/accounts');

    await page.waitForURL(/\/auth\/sign-in\?next=%2Fadmin%2Faccounts/);

    const remaining = (await context.cookies()).filter((c) =>
      c.name.startsWith(AUTH_COOKIE),
    );

    expect(remaining).toHaveLength(0);
  });
});
