/**
 * Pruebas E2E de la interfaz solo en español (ADR-021).
 *
 * La aplicación ya no tiene selector de idioma ni mensajes en inglés. Aquí
 * se comprueba, en unas cuantas páginas clave (landing, inicio de sesión,
 * panel del usuario, consola de administración y CMS), que el documento se
 * declara en español y que no aparece texto en inglés, ni visible ni en los
 * atributos accesibles. También que una cookie `locale=en` antigua no cambia
 * nada: el servidor la ignora y sirve el español.
 */
import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { I18nPageObject } from './i18n.po';

test.describe('Solo español: páginas públicas', () => {
  test('la landing está en español y sin selector de idioma', async ({
    page,
    context,
  }) => {
    const i18n = new I18nPageObject(page, context);

    await page.goto('/');

    await expect(i18n.htmlLang()).toHaveAttribute('lang', 'es');
    await expect(
      page.getByText('Lanza el software de tu pyme sin empezar de cero.'),
    ).toBeVisible();
    await expect(page.getByTestId('footer-language-selector')).toHaveCount(0);
    expect(await i18n.englishTexts()).toEqual([]);
  });

  test('una cookie locale=en antigua se ignora', async ({ page, context }) => {
    const i18n = new I18nPageObject(page, context);

    await i18n.setLocaleCookie('en');
    await page.goto('/');

    await expect(i18n.htmlLang()).toHaveAttribute('lang', 'es');
    await expect(
      page.getByText('Lanza el software de tu pyme sin empezar de cero.'),
    ).toBeVisible();
  });

  test('el inicio de sesión está en español', async ({ page, context }) => {
    const i18n = new I18nPageObject(page, context);

    await page.goto('/auth/sign-in');

    await expect(page.getByText('Inicia sesión en tu cuenta')).toBeVisible();
    await expect(page).toHaveTitle(/Iniciar sesión/);
    expect(await i18n.englishTexts()).toEqual([]);
  });
});

test.describe('Solo español: área privada', () => {
  // Usuario nuevo en cada prueba: la sesión guardada de `test@` la cierran
  // otras suites (cerrar sesión revoca todas sus sesiones).
  test.beforeEach(async ({ page }) => {
    const auth = new AuthPageObject(page);
    const email = auth.createRandomEmail();

    await auth.bootstrapUser({
      email,
      password: 'testingpassword',
      name: 'Usuaria de prueba',
    });

    await auth.loginAsUser({
      email,
      password: 'testingpassword',
      next: '/dashboard',
    });
  });

  test('el panel del usuario está en español', async ({ page, context }) => {
    const i18n = new I18nPageObject(page, context);

    await page.goto('/dashboard');

    await expect(i18n.htmlLang()).toHaveAttribute('lang', 'es');
    await expect(
      page.getByRole('heading', { name: 'Panel', level: 1 }),
    ).toBeVisible();
    expect(await i18n.englishTexts()).toEqual([]);
  });

  test('los ajustes de la cuenta no tienen selector de idioma', async ({
    page,
  }) => {
    await page.goto('/settings/profile');

    await expect(
      page.getByText('Tu foto de perfil', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Idioma', { exact: true })).toHaveCount(0);
  });
});

test.describe('Solo español: consola de administración', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  for (const path of ['/admin', '/admin/cms']) {
    test(`${path} está en español`, async ({ page, context }) => {
      const i18n = new I18nPageObject(page, context);

      await page.goto(path);

      await expect(i18n.htmlLang()).toHaveAttribute('lang', 'es');
      await expect(page.getByTestId('admin-sidebar-home')).toContainText(
        'Inicio',
      );
      expect(await i18n.englishTexts()).toEqual([]);
    });
  }

  test('Ajustes → General no tiene preferencia de idioma', async ({ page }) => {
    await page.goto('/admin/cms/settings/general');

    await expect(page.getByTestId('general-settings-form')).toBeVisible();
    await expect(page.getByTestId('language-select')).toHaveCount(0);
  });
});
