/**
 * *Page Object* de Ajustes del CMS (`/admin/cms/settings/**`, F2.7a y
 * F2.7b).
 *
 * Encapsula los selectores `data-testid` de las pestañas, del formulario
 * General, de la obligación de MFA y de las pantallas de miembros y de
 * permisos, para que las especificaciones solo describan el comportamiento
 * esperado.
 */
import { type Page, expect } from '@playwright/test';

export const SETTINGS_TABS = [
  'general',
  'authentication',
  'members',
  'permissions',
  'resources',
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export class SettingsPageObject {
  constructor(private readonly page: Page) {}

  tab(tab: SettingsTab) {
    return this.page.getByTestId(`cms-settings-tab-${tab}`);
  }

  /** Comprueba qué pestañas se muestran y cuáles no. */
  async expectTabs(visible: SettingsTab[]) {
    await expect(this.page.getByTestId('cms-settings-tabs')).toBeVisible();

    for (const tab of SETTINGS_TABS) {
      if (visible.includes(tab)) {
        await expect(this.tab(tab)).toBeVisible();
      } else {
        await expect(this.tab(tab)).toHaveCount(0);
      }
    }
  }

  /** Espera a que React hidrate la vista (atributo `data-hydrated`). */
  async waitForHydration(testId: string) {
    await expect(this.page.getByTestId(testId)).toHaveAttribute(
      'data-hydrated',
      'true',
    );
  }

  async gotoGeneral() {
    await this.page.goto('/admin/cms/settings/general');
    await expect(this.page.getByTestId('general-settings-form')).toBeVisible();
  }

  /** Elige una zona horaria en el selector con búsqueda y guarda. */
  async saveTimezone(timezone: string) {
    await this.page.getByTestId('timezone-selector-trigger').click();
    await this.page.getByTestId('timezone-selector-input').fill(timezone);
    await this.page.getByTestId(`timezone-selector-item-${timezone}`).click();
    await expect(this.page.getByTestId('timezone-selector-value')).toHaveText(
      timezone,
    );

    const saved = this.page.waitForResponse(
      (response) =>
        response.url().includes('/api/cms/v1/account/preferences') &&
        response.request().method() === 'POST',
    );

    await this.page.getByTestId('general-settings-submit').click();
    expect((await saved).status()).toBe(200);

    // Tras guardar, el formulario se vuelve a montar con lo guardado.
    await expect(this.page.getByTestId('timezone-selector-value')).toHaveText(
      timezone,
    );
  }

  async gotoMembers(query = '') {
    await this.page.goto(`/admin/cms/settings/members${query}`);
    await this.waitForHydration('members-view');
  }

  memberRows() {
    return this.page.locator('[data-testid="members-table"] tbody tr');
  }

  async gotoMember(id: string) {
    await this.page.goto(`/admin/cms/settings/members/${id}`);
    await this.waitForHydration('member-details');
  }

  notFound() {
    return this.page.getByTestId('root-not-found');
  }

  /** Ajustes > Permisos en la pestaña indicada (F2.7b). */
  async gotoPermissions(tab: 'roles' | 'groups' | 'permissions' = 'roles') {
    await this.page.goto(`/admin/cms/settings/permissions?tab=${tab}`);
    await this.waitForHydration('rbac-view');
  }

  /**
   * Marca en el diálogo de asignar la opción con ese id y guarda, esperando
   * a que la API responda 200.
   */
  async assign(id: string, endpoint: RegExp) {
    await expect(this.page.getByTestId('assign-dialog')).toBeVisible();
    await this.page.getByTestId(`assign-option-${id}`).click();

    const saved = this.page.waitForResponse(
      (response) =>
        endpoint.test(response.url()) && response.request().method() === 'PUT',
    );

    await this.page.getByTestId('assign-submit').click();
    expect((await saved).status()).toBe(200);
    await expect(this.page.getByTestId('assign-dialog')).toBeHidden();
  }
}
