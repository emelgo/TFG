/**
 * Genera las capturas de la consola de administración que ilustran la
 * memoria del TFG (capítulo de Diseño, «Consola por áreas de negocio»).
 *
 * Se toman de la aplicación real, igual que las de la landing
 * (`capture-marketing-screenshots.mjs`), para que la figura muestre la consola
 * tal como es y no un esquema dibujado a mano. Si la interfaz cambia, basta
 * con volver a ejecutar el script.
 *
 * Uso (con la build de test en marcha en http://localhost:3100 y el *seed*
 * cargado, que crea el super-admin con su factor TOTP):
 *   node apps/e2e/scripts/capture-console-screenshots.mjs
 *
 * Genera dos PNG en `memoria/figures/`, en tema claro (se imprimen mejor) y
 * a 1440×900:
 *   - `consola-explorador.png`: barra lateral por áreas y listado de las
 *     entradas del blog con el resumen de la tabla;
 *   - `consola-ayuda.png`: formulario de alta de una entrada con la ayuda
 *     contextual «?» de un campo abierta.
 *
 * [TFG] RNF-08: ilustra la consola por áreas y la ayuda contextual (ADR-020).
 */
import { chromium } from '@playwright/test';
import { TOTP } from 'totp-generator';

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';
const OUT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../memoria/figures',
);

// Secreto TOTP público del super-admin del seed (solo vale en local, B-03).
const SUPER_ADMIN_TOTP_KEY = 'NHOHJVGPO3R3LKVPRMNIYLCDMBHUM2SE';

// `--lang` fija el idioma de la interfaz del navegador, del que dependen los
// controles nativos como el selector de fecha.
const browser = await chromium.launch({ args: ['--lang=es-ES'] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'light',
  deviceScaleFactor: 2,
  // Idioma del navegador en español: los controles nativos (por ejemplo, el
  // selector de fecha) se muestran como los vería una pyme española.
  locale: 'es-ES',
  timezoneId: 'Europe/Madrid',
});
// El tema y el idioma los deciden las cookies de la app, no el navegador.
await context.addCookies([
  { name: 'theme', value: 'light', url: BASE_URL },
  { name: 'locale', value: 'es', url: BASE_URL },
]);

const page = await context.newPage();

// 1. Inicio de sesión del super-admin: contraseña y después segundo factor,
//    porque la consola exige una sesión aal2 (ADR-016).
await page.goto(`${BASE_URL}/auth/sign-in?next=/auth/verify`, {
  waitUntil: 'networkidle',
});
await page.fill('input[name="email"]', 'super-admin@pymekit.test');
await page.fill('input[name="password"]', 'testingpassword');
await page.click('button[type="submit"]');
await page.waitForURL((url) => url.pathname.startsWith('/auth/verify'));

const { otp } = await TOTP.generate(SUPER_ADMIN_TOTP_KEY, { period: 30 });
await page.fill('[data-input-otp]', otp);
await page.click('[data-testid="submit-mfa-button"]');
await page.waitForURL((url) => url.pathname.startsWith('/dashboard'));

// 2. Explorador de datos: listado de las entradas del blog, con el área
//    «Blog» desplegada en la barra lateral.
await page.goto(`${BASE_URL}/admin/cms/resources/public/blog_posts`, {
  waitUntil: 'networkidle',
});
const blogToggle = page.getByTestId('admin-sidebar-area-toggle-Blog');
if ((await blogToggle.getAttribute('aria-expanded')) === 'false') {
  await blogToggle.click();
}
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT_DIR}/consola-explorador.png` });

// 3. Formulario de alta con la ayuda «?» del campo «Resumen» abierta.
await page.goto(`${BASE_URL}/admin/cms/resources/public/blog_posts/new`, {
  waitUntil: 'networkidle',
});
await page
  .locator('[data-testid="record-form-field"][data-column="excerpt"]')
  .getByTestId('field-help')
  .click();
await page.getByTestId('field-help-content').waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT_DIR}/consola-ayuda.png` });

await browser.close();
console.log(`Capturas guardadas en ${OUT_DIR}`);
