import { createClient } from '@supabase/supabase-js';

/**
 * Pruebas E2E de la búsqueda global del CMS (F2.6): paleta Cmd/Ctrl+K de la
 * barra lateral de la consola.
 *
 * Con el super-admin (raíz del CMS, sesión con MFA):
 *  - abre la paleta con el atajo, ve los estados de texto corto y sin
 *    resultados, encuentra la cuenta de equipo del *seed* por su nombre,
 *    llega a ella con el teclado y abre su ficha;
 *  - encuentra una notificación que crea la prueba (control positivo de la
 *    prueba de permisos siguiente).
 *
 * Con el personal de soporte (solo lee `public.accounts` y
 * `public.accounts_memberships`):
 *  - todos los resultados son de esas dos tablas;
 *  - la misma notificación NO aparece, ni en la paleta ni llamando a la API;
 *  - la API rechaza textos o límites fuera de rango con un código estable.
 *
 * [TFG] RF-09 · RNF-02 · ADR-014.
 */
import { type Page, expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { GlobalSearchPageObject } from './audit-logs.po';

/** Cuenta de equipo del *seed* («PymeKit»). */
const TEAM_ACCOUNT = {
  id: '5deaa894-2094-4da3-b4fd-1fada0809d1c',
  name: 'PymeKit',
} as const;

/** Tablas que puede leer el personal de soporte del *seed*. */
const STAFF_TABLES = ['public.accounts', 'public.accounts_memberships'];

const RUN_ID = `e2e-cms-search-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;

/** Texto único de la notificación que el personal no debe encontrar. */
const NEEDLE = `${RUN_ID}-needle`;

type SearchResponse = {
  results: Array<{ schemaName: string; tableName: string; title: string }>;
};

/** Cliente con la clave de servicio del Supabase local (ignora RLS). */
function getAdminClient() {
  return createClient(
    'http://127.0.0.1:54321',
    'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz',
  );
}

async function searchApi(page: Page, query: string) {
  const response = await page.request.get(
    `/api/cms/v1/resources/search?query=${encodeURIComponent(query)}`,
  );

  expect(response.status()).toBe(200);

  return ((await response.json()) as SearchResponse).results;
}

test.beforeAll(async () => {
  // Una notificación (tabla que el personal de soporte NO puede leer) con un
  // texto único que ambas sesiones buscarán.
  const { error } = await getAdminClient()
    .from('notifications')
    .insert({ account_id: TEAM_ACCOUNT.id, body: NEEDLE });

  if (error) {
    throw new Error(`No se pudo crear la notificación: ${error.message}`);
  }
});

test.afterAll(async () => {
  await getAdminClient()
    .from('notifications')
    .delete()
    .like('body', `${RUN_ID}%`);
});

test.describe('Búsqueda global: super-admin con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('encuentra una cuenta por su nombre y abre su ficha con el teclado', async ({
    page,
  }) => {
    const search = new GlobalSearchPageObject(page);

    await page.goto('/admin/cms');
    await search.openWithShortcut();

    // Estados: texto corto y sin resultados.
    await search.search('M');
    await expect(page.getByTestId('global-search-min-chars')).toBeVisible();

    await search.search(`${RUN_ID}-nothing-matches`);
    await expect(page.getByTestId('global-search-no-results')).toBeVisible();

    // Resultados agrupados por tabla.
    await search.search(TEAM_ACCOUNT.name);

    const target = search
      .results()
      .filter({ has: page.getByTestId('global-search-result-title') })
      .filter({
        hasText: new RegExp(`^${TEAM_ACCOUNT.name}public\\.accounts$`),
      })
      .first();

    await expect(target).toBeVisible();
    await expect(
      page.locator(
        '[data-testid="global-search-group"][data-table="public.accounts"]',
      ),
    ).toBeVisible();

    // Navegación con el teclado: bajar hasta el resultado y pulsar Intro.
    const titles = await search.results().allTextContents();
    const index = titles.findIndex(
      (text) => text === `${TEAM_ACCOUNT.name}public.accounts`,
    );

    expect(index).toBeGreaterThanOrEqual(0);

    for (let step = 0; step < index; step++) {
      await page.keyboard.press('ArrowDown');
    }

    await expect(target).toHaveAttribute('data-selected', 'true');
    await page.keyboard.press('Enter');

    await page.waitForURL(
      `**/admin/cms/resources/public/accounts/record/${TEAM_ACCOUNT.id}`,
    );
    await expect(search.input()).toBeHidden();
  });

  test('encuentra una notificación (control del caso del personal)', async ({
    page,
  }) => {
    const search = new GlobalSearchPageObject(page);

    await page.goto('/admin/cms');
    await search.openWithShortcut();
    await search.search(NEEDLE);

    await expect(
      search.results().filter({ hasText: 'public.notifications' }),
    ).toHaveCount(1);

    const results = await searchApi(page, NEEDLE);

    expect(results.map((r) => `${r.schemaName}.${r.tableName}`)).toEqual([
      'public.notifications',
    ]);
    // La API no devuelve la fila completa, solo título, tabla y clave.
    expect(Object.keys(results[0]!).sort()).toEqual(
      ['keys', 'schemaName', 'tableDisplay', 'tableName', 'title'].sort(),
    );
  });
});

test.describe('Búsqueda global: personal de soporte', () => {
  AuthPageObject.setupSession(AUTH_STATES.CMS_STAFF);

  test('solo devuelve filas de las tablas que puede leer', async ({ page }) => {
    const search = new GlobalSearchPageObject(page);

    await page.goto('/admin/cms');
    await search.openWithShortcut();

    // La cuenta de equipo sí (public.accounts es legible)…
    await search.search(TEAM_ACCOUNT.name);
    await expect(search.results().first()).toBeVisible();

    for (const table of await search
      .results()
      .evaluateAll((items) => items.map((item) => item.dataset['table']))) {
      expect(STAFF_TABLES).toContain(table);
    }

    // …pero la notificación no (public.notifications no lo es).
    await search.search(NEEDLE);
    await expect(page.getByTestId('global-search-no-results')).toBeVisible();

    expect(await searchApi(page, NEEDLE)).toEqual([]);

    for (const result of await searchApi(page, TEAM_ACCOUNT.name)) {
      expect(STAFF_TABLES).toContain(
        `${result.schemaName}.${result.tableName}`,
      );
    }
  });

  test('la API rechaza textos y límites fuera de rango', async ({ page }) => {
    await page.goto('/admin/cms');

    for (const query of [
      'query=a',
      `query=${'x'.repeat(101)}`,
      'query=pymekit&limit=1000',
      'query=pymekit&offset=-1',
    ]) {
      const response = await page.request.get(
        `/api/cms/v1/resources/search?${query}`,
      );

      expect(response.status(), query).toBe(400);
      expect(await response.json()).toMatchObject({
        errorCode: 'GLOBAL_SEARCH_INVALID_QUERY',
      });
    }
  });
});
