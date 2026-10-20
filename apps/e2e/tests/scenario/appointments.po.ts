/**
 * *Page Object* del formulario público «Pedir cita» (`/appointments`) del
 * escenario de evaluación «Fisioterapia Bahía».
 */
import { type Page, expect } from '@playwright/test';

export class AppointmentsPageObject {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/appointments');
    await expect(this.form()).toBeVisible();
  }

  form() {
    return this.page.getByTestId('appointment-request-form');
  }

  fieldErrors() {
    return this.form().locator('[data-slot="field-error"]');
  }

  successAlert() {
    return this.page.getByTestId('appointment-success');
  }

  /** Botón «?» de un campo, por el texto de su etiqueta. */
  helpButton(label: RegExp) {
    return this.form().getByRole('button', { name: label });
  }

  helpContent() {
    return this.page.getByTestId('field-help-content');
  }

  /**
   * Envía el formulario vacío hasta que aparecen los errores. Se reintenta
   * porque un clic anterior a la hidratación de React se pierde.
   */
  async submitEmptyUntilValidated() {
    await expect(async () => {
      await this.submit();
      await expect(this.fieldErrors().first()).toBeVisible({ timeout: 1000 });
    }).toPass();
  }

  async fill(params: {
    fullName: string;
    email: string;
    phone: string;
    service: string;
    preferredDate: string;
    message: string;
  }) {
    await this.page.getByTestId('appointment-fullName').fill(params.fullName);
    await this.page.getByTestId('appointment-email').fill(params.email);
    await this.page.getByTestId('appointment-phone').fill(params.phone);
    await this.page
      .getByTestId('appointment-service')
      .selectOption(params.service);
    await this.page
      .getByTestId('appointment-preferredDate')
      .fill(params.preferredDate);
    await this.page.getByTestId('appointment-message').fill(params.message);
    await this.page.getByTestId('appointment-privacy').click();
  }

  async submit() {
    await this.page.getByTestId('appointment-submit').click();
  }
}
