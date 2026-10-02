/**
 * *Page Objects* del registro de auditoría (`/admin/cms/audit-logs`) y de la
 * búsqueda global del CMS (paleta Cmd/Ctrl+K).
 *
 * Encapsulan los selectores `data-testid` para que las especificaciones solo
 * describan el comportamiento esperado.
 */
import { type Page, expect } from '@playwright/test';

/** *Page Object* del registro de auditoría. */
export class AuditLogsPageObject {
  constructor(private readonly page: Page) {}

  async goto(query = '') {
    await this.page.goto(`/admin/cms/audit-logs${query}`);
    await this.waitForHydration('audit-logs-view');
  }

  /** Espera a que React hidrate la vista (atributo `data-hydrated`). */
  async waitForHydration(testId: string) {
    await expect(this.page.getByTestId(testId)).toHaveAttribute(
      'data-hydrated',
      'true',
    );
  }

  rows() {
    return this.page.locator('[data-testid="audit-logs-table"] tbody tr');
  }

  /** Fila cuyo identificador de registro es exactamente `recordId`. */
  rowForRecord(recordId: string) {
    return this.rows().filter({
      has: this.page
        .getByTestId('audit-log-record-id')
        .filter({ hasText: new RegExp(`^ID: ${recordId}$`) }),
    });
  }

  /** Rellena y aplica los filtros del listado. */
  async applyFilters(filters: {
    author?: string;
    operations?: string[];
    resource?: string;
    from?: string;
    to?: string;
  }) {
    if (filters.author) {
      await this.page
        .getByTestId('audit-logs-filter-author')
        .fill(filters.author);
    }

    if (filters.operations?.length) {
      await this.page.getByTestId('audit-logs-filter-operations').click();

      for (const operation of filters.operations) {
        await this.page
          .getByTestId(`audit-logs-operation-${operation}`)
          .click();
      }

      await this.page.keyboard.press('Escape');
    }

    if (filters.resource) {
      await this.page
        .getByTestId('audit-logs-filter-resource')
        .fill(filters.resource);
    }

    if (filters.from) {
      await this.page.getByTestId('audit-logs-filter-from').fill(filters.from);
    }

    if (filters.to) {
      await this.page.getByTestId('audit-logs-filter-to').fill(filters.to);
    }

    await this.page.getByTestId('audit-logs-apply').click();
  }

  /** Fila de la comparación de un campo en la ficha. */
  diffRow(field: string) {
    return this.page.locator(
      `[data-testid="audit-log-diff-row"][data-field="${field}"]`,
    );
  }
}

/** *Page Object* de la búsqueda global. */
export class GlobalSearchPageObject {
  constructor(private readonly page: Page) {}

  trigger() {
    return this.page.getByTestId('global-search-trigger');
  }

  input() {
    return this.page.getByTestId('global-search-input');
  }

  results() {
    return this.page.getByTestId('global-search-result');
  }

  /** Abre la paleta con el atajo de teclado (tras la hidratación). */
  async openWithShortcut() {
    await expect(this.trigger()).toHaveAttribute('data-hydrated', 'true');
    await this.page.keyboard.press('ControlOrMeta+k');
    await expect(this.input()).toBeVisible();
  }

  async search(text: string) {
    await this.input().fill(text);
  }
}
