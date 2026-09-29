/**
 * *Page Object* de la interfaz del CMS integrada en la consola de
 * administración (`/admin` y `/admin/cms/**`).
 *
 * Encapsula los selectores `data-testid` de la barra lateral (grupos
 * «Plataforma» y «CMS») y de la portada del CMS, para que las
 * especificaciones solo describan el comportamiento esperado.
 */
import { type Page, expect } from '@playwright/test';

/** Secciones del grupo «CMS» de la barra lateral. */
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

  platformGroup() {
    return this.page.getByTestId('admin-sidebar-platform-group');
  }

  cmsGroup() {
    return this.page.getByTestId('admin-sidebar-cms-group');
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
   * Comprueba qué entradas del grupo «CMS» se muestran y cuáles no.
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
