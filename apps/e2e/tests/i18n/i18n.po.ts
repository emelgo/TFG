/**
 * Page Object de las pruebas de idioma.
 *
 * Encapsula cómo se fija el idioma (la cookie `locale`, la misma que escribe
 * el selector de idioma) y cómo se usa el selector del pie de página.
 */
import type { BrowserContext, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:3100';

export class I18nPageObject {
  constructor(
    private readonly page: Page,
    private readonly context: BrowserContext,
  ) {}

  /** Fija el idioma con la cookie que lee el servidor en cada petición. */
  async setLocale(locale: 'es' | 'en') {
    await this.context.addCookies([
      { name: 'locale', value: locale, url: BASE_URL },
    ]);
  }

  /** Atributo `lang` del documento (lo fija el layout raíz). */
  htmlLang() {
    return this.page.locator('html');
  }

  /** Elige un idioma en el selector del pie de página (recarga la página). */
  async chooseFooterLanguage(name: RegExp) {
    await this.page
      .getByTestId('footer-language-selector')
      .getByRole('combobox')
      .click();
    await this.page.getByRole('option', { name }).click();
  }
}
