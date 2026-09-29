/**
 * *Page Object* del explorador de datos del CMS
 * (`/admin/cms/resources/:schema/:table`).
 *
 * Reúne los selectores `data-testid` del listado (tabla, paginación, barra
 * de filtros y gestión de columnas) para que las especificaciones solo
 * describan el comportamiento esperado.
 */
import { type Page, expect } from '@playwright/test';

export class DataExplorerPageObject {
  constructor(private readonly page: Page) {}

  async goto(schema: string, table: string, query = '') {
    await this.page.goto(`/admin/cms/resources/${schema}/${table}${query}`);
    await this.waitForHydration();
  }

  /**
   * Espera a que React hidrate la página: hasta entonces los botones del HTML
   * del SSR no responden. La barra de pestañas sirve de señal porque solo se
   * pinta en el navegador (depende de `localStorage`).
   */
  async waitForHydration() {
    await expect(this.page.getByTestId('tabs-container')).toBeVisible();
  }

  explorer() {
    return this.page.getByTestId('data-explorer');
  }

  title() {
    return this.page.getByTestId('table-title');
  }

  totalCount() {
    return this.page.getByTestId('table-total-count');
  }

  /** Total de registros que muestra la cabecera (atributo `data-count`). */
  async getTotalCount() {
    return Number(await this.totalCount().getAttribute('data-count'));
  }

  rows() {
    return this.page.locator('[data-testid="data-table"] tbody tr');
  }

  columnHeader(name: string) {
    return this.page.locator(
      `[data-testid="column-sort-button"][data-column="${name}"]`,
    );
  }

  pageIndicator() {
    return this.page.getByTestId('data-table-page-indicator');
  }

  nextPage() {
    return this.page.getByTestId('data-table-next-page');
  }

  /** Espera a que termine la navegación que provoca un cambio de la URL. */
  async waitForUrl(fragment: string | RegExp) {
    await this.page.waitForURL(
      typeof fragment === 'string'
        ? (url) => decodeURIComponent(url.search).includes(fragment)
        : fragment,
    );
  }

  async search(term: string) {
    const input = this.page.getByTestId('filters-search-input');

    await input.fill(term);
    await input.press('Enter');
  }

  /** Añade un filtro de texto: columna, operador y valor. */
  async addTextFilter(column: string, operator: string, value: string) {
    await this.page.getByTestId('add-filter-button').click();

    await this.page
      .locator(`[data-testid="filter-column-option"][data-column="${column}"]`)
      .click();

    await this.page.getByTestId('filter-operator-select').click();

    await this.page
      .locator(
        `[data-testid="filter-operator-option"][data-operator="${operator}"]`,
      )
      .click();

    const input = this.page.getByTestId('filter-value-input');

    await input.fill(value);
    await input.press('Enter');
  }

  filterBadges() {
    return this.page.getByTestId('filter-badge');
  }

  async toggleColumnVisibility(column: string) {
    await this.page.getByTestId('column-management-trigger').click();
    await this.page.getByTestId(`visibility-toggle-${column}`).click();
    await this.page.keyboard.press('Escape');
  }

  async expectRowsContain(text: string) {
    await expect(this.rows().first()).toBeVisible();

    const count = await this.rows().count();

    for (let i = 0; i < count; i++) {
      await expect(this.rows().nth(i)).toContainText(text, {
        ignoreCase: true,
      });
    }
  }
}
