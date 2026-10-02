/**
 * *Page Object* de la interfaz del CMS integrada en la consola de
 * administración (`/admin` y `/admin/cms/**`).
 *
 * Encapsula los selectores `data-testid` de la barra lateral («Inicio»,
 * áreas de datos y herramientas) y de la portada del CMS, para que las
 * especificaciones solo describan el comportamiento esperado.
 */
import { type Page, expect } from '@playwright/test';

/**
 * Herramientas de la barra lateral («resources» es el enlace «Todas las
 * tablas»).
 */
export const CMS_SIDEBAR_SECTIONS = [
  'resources',
  'users',
  'storage',
  'auditLogs',
  'dashboards',
  'settings',
] as const;

export type CmsSidebarSection = (typeof CMS_SIDEBAR_SECTIONS)[number];

export class CmsPageObject {
  constructor(private readonly page: Page) {}

  /** Entrada «Inicio» (solo super-admin). */
  homeEntry() {
    return this.page.getByTestId('admin-sidebar-home');
  }

  /** Bloque «Gestión» (Inicio, Gestión de cuentas, Usuarios, Archivos…). */
  managementGroup() {
    return this.page.getByTestId('admin-sidebar-management');
  }

  /** Bloque «Datos» (carpetas por área y «Todas las tablas»). */
  dataGroup() {
    return this.page.getByTestId('admin-sidebar-data');
  }

  /** Área de la barra lateral por su nombre (`other` = «Otros datos»). */
  sidebarArea(name: string) {
    return this.page.getByTestId(`admin-sidebar-area-${name}`);
  }

  /** Botón que pliega o despliega un área. */
  sidebarAreaToggle(name: string) {
    return this.page.getByTestId(`admin-sidebar-area-toggle-${name}`);
  }

  /** Todos los botones de área de la barra lateral. */
  sidebarAreaToggles() {
    return this.page.locator('[data-testid^="admin-sidebar-area-toggle-"]');
  }

  /**
   * Despliega un área si está plegada. Se reintenta porque un clic hecho
   * antes de que React hidrate la página se pierde.
   */
  async openSidebarArea(name: string) {
    const toggle = this.sidebarAreaToggle(name);

    await expect(async () => {
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
        await toggle.click();
      }

      await expect(toggle).toHaveAttribute('aria-expanded', 'true', {
        timeout: 1000,
      });
    }).toPass();
  }

  /** Enlace de la barra lateral a una tabla (`schema.tabla`). */
  sidebarResource(qualifiedName: string) {
    return this.page.getByTestId(`admin-sidebar-resource-${qualifiedName}`);
  }

  /** Todos los enlaces a tablas de la barra lateral. */
  sidebarResources() {
    return this.page.locator('[data-testid^="admin-sidebar-resource-"][href]');
  }

  /** «Gestión de cuentas», en el bloque Gestión (solo super-admin). */
  accountsManagementEntry() {
    return this.page.getByTestId('admin-sidebar-platform-accounts');
  }

  cmsSidebarEntry(section: CmsSidebarSection) {
    return this.page.getByTestId(`admin-sidebar-cms-${section}`);
  }

  /** Enlace de la portada del CMS a una tabla (`schema.tabla`). */
  resourceLink(qualifiedName: string) {
    return this.page.getByTestId(`cms-resource-${qualifiedName}`);
  }

  /** Todos los enlaces a tablas de la portada del CMS. */
  resourceLinks() {
    return this.page.locator('[data-testid^="cms-resource-"][href]');
  }

  notFound() {
    return this.page.getByTestId('root-not-found');
  }

  mfaRequired() {
    return this.page.getByTestId('cms-mfa-required');
  }

  /**
   * Comprueba qué herramientas se muestran y cuáles no.
   */
  async expectCmsSections(visible: CmsSidebarSection[]) {
    for (const section of CMS_SIDEBAR_SECTIONS) {
      const entry = this.cmsSidebarEntry(section);

      if (visible.includes(section)) {
        await expect(entry).toBeVisible();
      } else {
        await expect(entry).toHaveCount(0);
      }
    }
  }
}
