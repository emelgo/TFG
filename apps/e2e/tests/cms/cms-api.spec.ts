/**
 * Pruebas E2E de la API del CMS montada en `/api/cms/*`.
 *
 * Comprueban, contra la web en marcha, las tres barreras de acceso de la API:
 *
 *  1. Sin sesión: las rutas protegidas responden 401.
 *  2. Con sesión de un usuario normal (sin el *claim* `cms_access`): 403.
 *  3. Con sesión del super-admin con MFA verificado (aal2): 200. Es la raíz
 *     del CMS (ADR-014), así que puede leer la navegación y los recursos.
 *
 * Las peticiones se hacen con `page.request`, que comparte las *cookies* del
 * contexto del navegador: es exactamente lo que hará la interfaz del CMS.
 *
 * [TFG] RF-09 · RNF-02: el acceso al CMS se verifica de extremo a extremo.
 */
import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';

// Rutas protegidas que usará la interfaz del CMS al cargar.
const PROTECTED_ENDPOINTS = ['/api/cms/v1/navigation', '/api/cms/v1/resources'];

test.describe('API del CMS: comprobación de salud', () => {
  test('GET /v1/health responde 200 sin sesión', async ({ request }) => {
    const response = await request.get('/api/cms/v1/health');

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});

test.describe('API del CMS: petición anónima', () => {
  for (const endpoint of PROTECTED_ENDPOINTS) {
    test(`${endpoint} responde 401 sin sesión`, async ({ request }) => {
      const response = await request.get(endpoint);

      expect(response.status()).toBe(401);
    });
  }
});

test.describe('API del CMS: usuario sin acceso al CMS', () => {
  // El propietario de un equipo es un usuario normal: no tiene el claim
  // `cms_access`, así que el middleware de la API lo rechaza.
  AuthPageObject.setupSession(AUTH_STATES.OWNER_USER);

  for (const endpoint of PROTECTED_ENDPOINTS) {
    test(`${endpoint} responde 403`, async ({ page }) => {
      // Visitar la web primero deja refrescada la sesión en las cookies.
      await page.goto('/home');

      const response = await page.request.get(endpoint);

      expect(response.status()).toBe(403);
    });
  }
});

test.describe('API del CMS: super-admin sin MFA', () => {
  // Este usuario es super-admin (y por tanto tiene el claim `cms_access`),
  // pero su sesión es aal1. La API pregunta a la base de datos
  // (`cms.verify_admin_access()`), que exige MFA por defecto (ADR-014), y
  // rechaza la petición con 403.
  AuthPageObject.setupSession(AUTH_STATES.TEST_USER);

  test('GET /v1/navigation responde 403 sin segundo factor', async ({
    page,
  }) => {
    await page.goto('/home');

    const response = await page.request.get('/api/cms/v1/navigation');

    expect(response.status()).toBe(403);

    // La interfaz distingue este 403 (resoluble verificando el segundo
    // factor) de un rechazo definitivo gracias a su `errorCode`.
    expect(await response.json()).toMatchObject({
      errorCode: 'CMS_MFA_OR_INACTIVE_ACCOUNT',
    });
  });
});

test.describe('API del CMS: super-admin con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('GET /v1/navigation responde 200 con los recursos legibles', async ({
    page,
  }) => {
    // La consola de administración exige MFA: si carga, la sesión es aal2.
    await page.goto('/admin');

    const response = await page.request.get('/api/cms/v1/navigation');

    expect(response.status()).toBe(200);
    expect(Array.isArray(await response.json())).toBe(true);
  });

  test('GET /v1/resources responde 200', async ({ page }) => {
    await page.goto('/admin');

    const response = await page.request.get('/api/cms/v1/resources');

    expect(response.status()).toBe(200);
  });
});
