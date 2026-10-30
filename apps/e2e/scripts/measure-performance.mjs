/**
 * Mide el tiempo de carga de las pantallas más pesadas de PymeKit con un
 * volumen de datos representativo (RNF-09).
 *
 * El requisito pide un rendimiento razonable, no un objetivo numérico; esta
 * medición comprueba que las pantallas que crecen con los datos (listados de
 * cuentas y usuarios, explorador del CMS, miembros de un equipo) siguen
 * respondiendo bien cuando la base de datos tiene decenas de veces más filas
 * que el entorno de desarrollo.
 *
 * Procedimiento:
 *   1. mide cada pantalla con los datos actuales (línea base);
 *   2. inserta 10.000 usuarios de prueba (y, por el trigger de alta, sus
 *      10.000 cuentas personales) y hace a 300 de ellos miembros del equipo
 *      del seed, en una sola transacción;
 *   3. vuelve a medir;
 *   4. borra todo lo insertado, también si algo falla.
 *
 * Cada medida es la mediana de cinco cargas completas de la página (hasta
 * que la red queda en reposo), tras una carga de calentamiento.
 *
 * Uso (con la build de test en http://localhost:3100, la Supabase local y
 * las sesiones de `apps/e2e/.auth` recién generadas por los E2E):
 *   node apps/e2e/scripts/measure-performance.mjs
 *
 * [TFG] RNF-09.
 */
import { chromium } from '@playwright/test';

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';
const DB_CONTAINER = process.env.DB_CONTAINER ?? 'supabase_db_pymekit';
const AUTH_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../.auth');

const USERS = 10_000;
const TEAM_MEMBERS = 300;
const RUNS = 5;

// Los usuarios de prueba se reconocen por su dominio, para poder borrarlos.
const EMAIL_PATTERN = 'perf-%@rendimiento.test';

const SCREENS = [
  {
    session: 'super-admin',
    path: '/admin/accounts',
    label: 'Gestión de cuentas (consola)',
  },
  {
    session: 'super-admin',
    path: '/admin/cms/resources/public/accounts',
    label: 'Explorador del CMS: cuentas',
  },
  {
    session: 'super-admin',
    path: '/admin/cms/users',
    label: 'Explorador de usuarios',
  },
  { session: 'super-admin', path: '/admin/cms/audit-logs', label: 'Auditoría' },
  {
    session: 'test',
    path: '/settings/members',
    label: 'Miembros de un equipo',
  },
];

/** Ejecuta SQL como `postgres` dentro del contenedor de la base de datos. */
function sql(statement) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      DB_CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-tA',
    ],
    { input: statement, encoding: 'utf8' },
  ).trim();
}

const TEAM_ID = sql(`select id from public.accounts where slug = 'pymekit';`);
const TEST_USER_ID = sql(
  `select id from auth.users where email = 'test@pymekit.test';`,
);

// La pantalla de miembros muestra la cuenta activa del usuario: se fija el
// equipo del seed y al final se deja como estaba.
const previousActiveAccount = sql(
  `select account_id from public.user_active_account where user_id = '${TEST_USER_ID}';`,
);

function setActiveAccount(accountId) {
  if (accountId) {
    sql(`insert into public.user_active_account (user_id, account_id)
         values ('${TEST_USER_ID}', '${accountId}')
         on conflict (user_id) do update set account_id = excluded.account_id;`);
  } else {
    sql(
      `delete from public.user_active_account where user_id = '${TEST_USER_ID}';`,
    );
  }
}

function insertTestData() {
  sql(`begin;
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    select '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
           'authenticated', 'authenticated',
           'perf-' || g || '@rendimiento.test', '', now(),
           '{"provider": "email", "providers": ["email"]}',
           jsonb_build_object('name', 'Cliente ' || g), now(), now(), '', '', '', ''
    from generate_series(1, ${USERS}) as g;

    insert into public.accounts_memberships (user_id, account_id, account_role)
    select id, '${TEAM_ID}', 'member'
    from auth.users
    where email like '${EMAIL_PATTERN}'
    order by email
    limit ${TEAM_MEMBERS};
    commit;
    -- Estadísticas al día para que el planificador vea el volumen real.
    analyze auth.users;
    analyze public.accounts;
    analyze public.accounts_memberships;`);
}

function deleteTestData() {
  // Las cuentas personales y las membresías se borran en cascada.
  sql(`delete from auth.users where email like '${EMAIL_PATTERN}';`);
}

function counts() {
  return sql(`select (select count(*) from public.accounts) || ' cuentas, '
    || (select count(*) from auth.users) || ' usuarios, '
    || (select count(*) from public.accounts_memberships where account_id = '${TEAM_ID}')
    || ' miembros del equipo';`);
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/**
 * Contexto del navegador con la sesión del usuario. El super-admin reutiliza
 * la sesión que guardan los E2E (tiene MFA); el usuario de pruebas inicia
 * sesión de nuevo, porque algunas pruebas revocan su sesión guardada.
 */
async function newSession(browser, session) {
  if (session !== 'test') {
    return browser.newContext({
      storageState: `${AUTH_DIR}/${session}@pymekit.test.json`,
    });
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/auth/sign-in`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', 'test@pymekit.test');
  await page.fill('input[name="password"]', 'testingpassword');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname.startsWith('/dashboard'));
  await page.close();

  return context;
}

async function measure(browser) {
  const results = [];

  for (const screen of SCREENS) {
    const context = await newSession(browser, screen.session);
    const page = await context.newPage();
    const url = `${BASE_URL}${screen.path}`;

    await page.goto(url, { waitUntil: 'networkidle' }); // calentamiento

    const totals = [];
    const ttfbs = [];

    for (let run = 0; run < RUNS; run++) {
      const start = performance.now();
      await page.goto(url, { waitUntil: 'networkidle' });
      totals.push(performance.now() - start);

      ttfbs.push(
        await page.evaluate(
          () => performance.getEntriesByType('navigation')[0].responseStart,
        ),
      );
    }

    // Si la sesión no es válida, la app redirige: la medida no serviría.
    if (!page.url().startsWith(url)) {
      throw new Error(`Redirigido desde ${screen.path} a ${page.url()}`);
    }

    results.push({
      label: screen.label,
      path: screen.path,
      ttfb: Math.round(median(ttfbs)),
      total: Math.round(median(totals)),
    });

    await context.close();
  }

  return results;
}

const browser = await chromium.launch();

try {
  setActiveAccount(TEAM_ID);

  const baselineCounts = counts();
  const baseline = await measure(browser);

  insertTestData();
  const loadedCounts = counts();
  const loaded = await measure(browser);

  console.log(`Línea base: ${baselineCounts}`);
  console.log(`Con datos de prueba: ${loadedCounts}\n`);
  console.log(
    '| Pantalla | Base: TTFB / total (ms) | Con datos: TTFB / total (ms) |',
  );
  console.log('|---|---|---|');

  baseline.forEach((row, index) => {
    const after = loaded[index];
    console.log(
      `| ${row.label} | ${row.ttfb} / ${row.total} | ${after.ttfb} / ${after.total} |`,
    );
  });
} finally {
  deleteTestData();
  setActiveAccount(previousActiveAccount || null);
  await browser.close();
  console.log(`\nDatos de prueba borrados: ${counts()}`);
}
