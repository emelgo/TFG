/**
 * Pruebas E2E del idioma español (F3a).
 *
 * El español es el idioma por defecto de PymeKit, pero la build de tests se
 * compila con `VITE_DEFAULT_LOCALE=en` (ver `apps/web/.env.test`) para que el
 * resto de la suite, escrita contra textos en inglés, siga siendo estable.
 * Por eso aquí se fuerza el español igual que lo haría el selector de idioma:
 * con la cookie `locale=es`, que el servidor lee en cada petición.
 *
 * Se comprueban la landing, el inicio de sesión y la consola del CMS, y que el
 * selector de idioma del pie de página permite volver al inglés.
 */
import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { CmsPageObject } from '../cms/cms.po';
import { AUTH_STATES } from '../utils/auth-state';
import { I18nPageObject } from './i18n.po';

test.describe('Idioma español: páginas públicas', () => {
  test('la landing se muestra en español', async ({ page, context }) => {
    const i18n = new I18nPageObject(page, context);

    await i18n.setLocale('es');
    await page.goto('/');

    await expect(i18n.htmlLang()).toHaveAttribute('lang', 'es');
    await expect(
      page.getByText('Lanza el software de tu pyme sin empezar de cero.'),
    ).toBeVisible();
    await expect(
      page.getByText('CMS integrado', { exact: true }),
    ).toBeVisible();
  });

  test('el inicio de sesión se muestra en español', async ({
    page,
    context,
  }) => {
    const i18n = new I18nPageObject(page, context);

    await i18n.setLocale('es');
    await page.goto('/auth/sign-in');

    await expect(page.getByText('Inicia sesión en tu cuenta')).toBeVisible();
    await expect(page).toHaveTitle(/Iniciar sesión/);
  });

  test('el selector del pie de página cambia a inglés', async ({
    page,
    context,
  }) => {
    const i18n = new I18nPageObject(page, context);

    await i18n.setLocale('es');
    await page.goto('/');

    await i18n.chooseFooterLanguage(/inglés/i);

    // El selector guarda la cookie y recarga: la landing pasa a inglés.
    await expect(
      page.getByText(
        'Launch your business software without starting from scratch.',
      ),
    ).toBeVisible();
    await expect(i18n.htmlLang()).toHaveAttribute('lang', 'en');
  });
});

test.describe('Idioma español: consola del CMS', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('la portada del CMS se muestra en español', async ({
    page,
    context,
  }) => {
    const i18n = new I18nPageObject(page, context);

    await i18n.setLocale('es');
    await page.goto('/admin/cms');

    await expect(new CmsPageObject(page).homeEntry()).toContainText('Inicio');
    await expect(
      page.getByText('Tablas que puedes leer, agrupadas por área.'),
    ).toBeVisible();
  });
});
