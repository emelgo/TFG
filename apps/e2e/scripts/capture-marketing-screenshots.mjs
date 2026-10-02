/**
 * Genera las capturas de pantalla de la landing a partir de la aplicación
 * real (no de imágenes de terceros).
 *
 * Las capturas que muestra la página de inicio deben corresponder a PymeKit:
 * si la interfaz cambia (por ejemplo, al pasarla al español en la F3), basta
 * con volver a ejecutar este script contra la app arrancada.
 *
 * Uso (con la build de test en marcha en http://localhost:3100 —la de
 * desarrollo muestra las herramientas de TanStack— y el *seed* cargado):
 *   node apps/e2e/scripts/capture-marketing-screenshots.mjs
 *
 * Genera PNG en `apps/web/public/images/` (`dashboard.png` y `sign-in.png`),
 * en español (cookie `locale=es`, F3b: así no dependen del idioma por defecto
 * de la build ni de `.env.test`, que fuerza el inglés para los E2E), en modo
 * oscuro y a 1600×900, iniciando sesión con el usuario propietario del
 * *seed* (`owner@pymekit.test`, sin MFA).
 *
 * [TFG] RF-01: identidad visual propia de la landing (desmarcado, B-40).
 */
import { chromium } from '@playwright/test';

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';
const THEME_COOKIE = 'theme';
const LOCALE_COOKIE = 'locale';
const LOCALE = process.env.SCREENSHOT_LOCALE ?? 'es';
const OUT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../web/public/images',
);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  colorScheme: 'dark',
  deviceScaleFactor: 1,
});
// El tema y el idioma los deciden las cookies de la app, no las
// preferencias del navegador.
await context.addCookies([
  { name: THEME_COOKIE, value: 'dark', url: BASE_URL },
  { name: LOCALE_COOKIE, value: LOCALE, url: BASE_URL },
]);

const page = await context.newPage();

// 1. Página de inicio de sesión (sin sesión).
await page.goto(`${BASE_URL}/auth/sign-in`, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${OUT_DIR}/sign-in.png` });

// 2. Panel de la cuenta tras iniciar sesión como propietario del seed.
await page.fill('input[name="email"]', 'owner@pymekit.test');
await page.fill('input[name="password"]', 'testingpassword');
await page.click('button[type="submit"]');
// Se espera a la ruta exacta: `**/dashboard**` coincidía ya con el
// `?next=/dashboard` de la página de login.
await page.waitForURL((url) => url.pathname.startsWith('/dashboard'), {
  timeout: 30_000,
});
// El router cambia la URL antes de terminar de pintar la página nueva: se
// espera a un elemento propio del panel y a que no queden peticiones.
await page.getByTestId('workspace-dropdown-trigger').waitFor();
await page.waitForLoadState('networkidle');
await page.mouse.move(0, 0); // sin tooltips de las gráficas
await page.waitForTimeout(1_000); // animaciones de entrada de las gráficas
await page.screenshot({ path: `${OUT_DIR}/dashboard.png` });

await browser.close();

console.log(`Capturas guardadas en ${OUT_DIR}`);
