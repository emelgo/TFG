/**
 * *Page Object* del explorador de usuarios del CMS (`/admin/cms/users`).
 *
 * Encapsula los selectores `data-testid` del listado, la ficha y los
 * diálogos de confirmación de las acciones.
 */
import { type Page, expect } from '@playwright/test';

/** *Page Object* del explorador de usuarios. */
export class UsersExplorerPageObject {
  constructor(private readonly page: Page) {}

  async gotoList(query = '') {
    await this.page.goto(`/admin/cms/users${query}`);
    await this.waitForHydration('users-explorer');
  }

  async gotoUser(id: string) {
    await this.page.goto(`/admin/cms/users/${id}`);
    await this.waitForHydration('user-details');
  }

  /** Espera a que React hidrate la vista (atributo `data-hydrated`). */
  async waitForHydration(testId: string) {
    await expect(this.page.getByTestId(testId)).toHaveAttribute(
      'data-hydrated',
      'true',
    );
  }

  rows() {
    return this.page.locator('[data-testid="data-table"] tbody tr');
  }

  emails() {
    return this.page.getByTestId('user-email');
  }

  action(name: string) {
    return this.page.getByTestId(`user-action-${name}`);
  }

  /** Abre el diálogo de una acción, la confirma y espera a que se cierre. */
  async runAction(name: string, confirmWord?: string) {
    const dialog = this.page.getByTestId(`user-action-${name}-dialog`);

    await this.action(name).click();
    await expect(dialog).toBeVisible();

    if (confirmWord) {
      await this.page
        .getByTestId(`user-action-${name}-confirm-input`)
        .fill(confirmWord);
    }

    await this.page.getByTestId(`user-action-${name}-confirm`).click();
    await expect(dialog).toBeHidden();
  }
}
