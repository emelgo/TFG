/**
 * *Page Object* del explorador de almacenamiento del CMS
 * (`/admin/cms/storage`).
 *
 * Encapsula los selectores `data-testid` de la lista de *buckets*, de la
 * cuadrícula de ficheros y de su menú de acciones.
 */
import { type Page, expect } from '@playwright/test';

/** *Page Object* del explorador de almacenamiento. */
export class StorageExplorerPageObject {
  constructor(private readonly page: Page) {}

  async gotoBuckets() {
    await this.page.goto('/admin/cms/storage');
    await this.waitForHydration('storage-explorer');
  }

  async gotoFolder(bucket: string, path: string) {
    await this.page.goto(
      `/admin/cms/storage/${bucket}?path=${encodeURIComponent(path)}`,
    );
    await this.waitForHydration('storage-file-explorer');
  }

  async waitForHydration(testId: string) {
    await expect(this.page.getByTestId(testId)).toHaveAttribute(
      'data-hydrated',
      'true',
    );
  }

  item(name: string) {
    return this.page.locator(
      `[data-testid="storage-item"][data-name="${name}"]`,
    );
  }

  async openItemMenu(name: string) {
    await this.item(name).getByTestId('storage-item-menu').click();
  }
}
