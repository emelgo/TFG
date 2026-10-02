/**
 * Page Object de las pruebas de idioma.
 *
 * La aplicación solo está en español (ADR-021). Este objeto permite simular
 * una *cookie* `locale` antigua (por ejemplo, `en` de cuando había selector
 * de idioma) y buscar restos de texto en inglés en la página.
 */
import type { BrowserContext, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:3100';

/**
 * Palabras y frases en inglés típicas de una interfaz. Se buscan con
 * distinción de mayúsculas y límites de palabra para no confundirlas con
 * texto español («No», «Error» o «Plan» se escriben igual en los dos
 * idiomas, así que no están en la lista).
 */
const ENGLISH_UI_WORDS = [
  'Sign in',
  'Sign up',
  'Sign out',
  'Settings',
  'Loading',
  'Close',
  'Toggle',
  'Search',
  'Welcome',
  'Billing',
  'Users',
  'Save',
  'Cancel',
  'Delete',
  'Create',
  'Previous',
  'Next',
  'Home',
  'Your',
  'Password',
  'Email address',
  'Account',
  'Members',
  'Language',
];

const ENGLISH_PATTERN = new RegExp(
  `(^|[^\\p{L}])(${ENGLISH_UI_WORDS.join('|')})(?=$|[^\\p{L}])`,
  'u',
);

export class I18nPageObject {
  constructor(
    private readonly page: Page,
    private readonly context: BrowserContext,
  ) {}

  /** Simula una cookie `locale` guardada (el servidor debe ignorarla si no existe). */
  async setLocaleCookie(locale: string) {
    await this.context.addCookies([
      { name: 'locale', value: locale, url: BASE_URL },
    ]);
  }

  /** Atributo `lang` del documento (lo fija el layout raíz). */
  htmlLang() {
    return this.page.locator('html');
  }

  /**
   * Textos en inglés de la página: el texto visible (incluido el de los
   * lectores de pantalla) y los atributos `aria-label`, `title`, `alt` y
   * `placeholder`. Devuelve las coincidencias para que el fallo diga cuáles.
   */
  async englishTexts() {
    const texts = await this.page.evaluate(() => {
      const out = [document.body.innerText];

      for (const el of document.querySelectorAll(
        '[aria-label], [title], [alt], [placeholder]',
      )) {
        for (const attr of ['aria-label', 'title', 'alt', 'placeholder']) {
          const value = el.getAttribute(attr);
          if (value) out.push(value);
        }
      }

      return out.flatMap((text) => text.split('\n'));
    });

    return texts.filter((line) => ENGLISH_PATTERN.test(line));
  }
}
