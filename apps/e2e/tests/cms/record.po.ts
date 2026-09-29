/**
 * *Page Object* de la ficha de un registro del explorador de datos del CMS
 * (`/admin/cms/resources/:schema/:table/record/...`).
 *
 * Reúne los selectores `data-testid` de la ficha (campos, migas de pan y
 * secciones de registros relacionados) para que las especificaciones solo
 * describan el comportamiento esperado.
 */
import { type Page, expect } from '@playwright/test';

export class RecordPageObject {
  constructor(private readonly page: Page) {}

  async goto(path: string) {
    await this.page.goto(`/admin/cms/resources/${path}`);
  }

  /**
   * Espera a que React hidrate la página: la barra de pestañas solo se pinta
   * en el navegador (depende de `localStorage`).
   */
  async waitForHydration() {
    await expect(this.page.getByTestId('tabs-container')).toBeVisible();
  }

  recordPage() {
    return this.page.getByTestId('cms-record-page');
  }

  title() {
    return this.page.getByTestId('record-title');
  }

  field(column: string) {
    return this.page.locator(
      `[data-testid="record-field"][data-column="${column}"]`,
    );
  }

  fieldValue(column: string) {
    return this.field(column).getByTestId('record-field-value');
  }

  fieldRelationLink(column: string) {
    return this.field(column).getByTestId('record-field-relation-link');
  }

  backLink() {
    return this.page.getByTestId('record-back-link');
  }

  relatedSections() {
    return this.page.getByTestId('related-records-section');
  }

  /** Sección de registros relacionados de una tabla (`esquema.tabla`). */
  relatedSection(table: string) {
    return this.page.locator(
      `[data-testid="related-records-section"][data-table="${table}"]`,
    );
  }

  relatedRows(table: string) {
    return this.relatedSection(table).locator(
      '[data-testid="data-table"] tbody tr',
    );
  }
}
