/**
 * *Page Object* de las escrituras del explorador de datos del CMS: el
 * formulario de crear y editar un registro, los diálogos de borrado y la
 * selección de filas del listado.
 *
 * Reúne los selectores `data-testid` para que las especificaciones solo
 * describan el comportamiento esperado.
 */
import { type Page, expect } from '@playwright/test';

export class RecordFormPageObject {
  constructor(private readonly page: Page) {}

  formPage() {
    return this.page.getByTestId('record-form-page');
  }

  /** Espera a que el formulario esté hidratado (pestañas del explorador). */
  async waitForForm() {
    await expect(this.formPage()).toBeVisible();
    await expect(this.page.getByTestId('tabs-container')).toBeVisible();
  }

  field(column: string) {
    return this.page.locator(
      `[data-testid="record-form-field"][data-column="${column}"]`,
    );
  }

  input(column: string) {
    return this.field(column).getByTestId('record-field-input');
  }

  fieldError(column: string) {
    return this.field(column).getByTestId('record-form-field-error');
  }

  async fill(column: string, value: string) {
    await this.input(column).fill(value);
  }

  /** Elige una fila en el selector de una clave foránea. */
  async pickRelation(column: string, search: string, value: string) {
    await this.field(column)
      .getByTestId('record-field-relation-picker')
      .click();
    await this.page.getByTestId('relation-picker-search').fill(search);

    await this.page
      .locator(`[data-testid="relation-picker-option"][data-value="${value}"]`)
      .click();

    await expect(
      this.field(column).getByTestId('relation-picker-value'),
    ).not.toBeEmpty();
  }

  async toggleSwitch(column: string) {
    await this.field(column).getByTestId('record-field-switch').click();
  }

  submit() {
    return this.page.getByTestId('record-form-submit');
  }

  createLink() {
    return this.page.getByTestId('create-record-link');
  }

  editButton() {
    return this.page.getByTestId('edit-record-button');
  }

  deleteButton() {
    return this.page.getByTestId('delete-record-button');
  }

  async confirmDelete() {
    await this.deleteButton().click();
    await expect(this.page.getByTestId('delete-record-dialog')).toBeVisible();
    await this.page.getByTestId('confirm-delete-record').click();
  }

  selectAllRows() {
    return this.page.getByTestId('select-all-rows');
  }

  batchDeleteButton() {
    return this.page.getByTestId('batch-delete-button');
  }

  async confirmBatchDelete() {
    await this.batchDeleteButton().click();
    await expect(this.page.getByTestId('batch-delete-dialog')).toBeVisible();
    await this.page.getByTestId('confirm-batch-delete').click();
  }

  inlineEditButtons() {
    return this.page.getByTestId('inline-edit-button');
  }
}
