import { type Page, expect } from '@playwright/test';

/**
 * *Page Object* de los paneles del CMS (F2.8): abrir diálogos tras la
 * hidratación, añadir *widgets* desde el editor y localizar un *widget* de
 * la rejilla por su título.
 */
export class DashboardsPageObject {
  constructor(private readonly page: Page) {}

  /** Pulsa hasta que la página esté hidratada y se abra lo esperado. */
  async clickUntilVisible(button: string, target: string) {
    await expect(async () => {
      await this.page.getByTestId(button).click();
      await expect(this.page.getByTestId(target)).toBeVisible({
        timeout: 1000,
      });
    }).toPass();
  }

  /** Un *widget* de la rejilla por su título. */
  widget(title: string) {
    return this.page.locator(
      `[data-testid="dashboard-widget"][data-widget-title="${title}"]`,
    );
  }

  /** Añade un *widget* desde el editor y espera a que se cierre. */
  async addWidget(widget: {
    title: string;
    type: 'metric' | 'chart';
    table: string;
    xAxis?: string;
  }) {
    await this.clickUntilVisible(
      'dashboard-add-widget',
      'widget-editor-dialog',
    );

    const dialog = this.page.getByTestId('widget-editor-dialog');

    await dialog.getByTestId('widget-title-input').fill(widget.title);
    await dialog.getByTestId('widget-type-select').selectOption(widget.type);
    await dialog.getByTestId('widget-table-select').selectOption(widget.table);

    // Las columnas llegan del metadato de la tabla elegida.
    await expect(
      dialog.getByTestId('widget-value-column-select'),
    ).toBeVisible();

    if (widget.xAxis) {
      await dialog.getByTestId('widget-chart-type-select').selectOption('bar');
      await dialog
        .getByTestId('widget-x-axis-select')
        .selectOption(widget.xAxis);
    }

    await dialog.getByTestId('widget-editor-submit').click();
    await expect(dialog).toBeHidden();

    return this.widget(widget.title);
  }
}
