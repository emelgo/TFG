import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/**
 * Page Object de la auditoría automática de accesibilidad (RNF-08).
 *
 * Usa axe-core, el motor de reglas de accesibilidad más extendido, para
 * revisar una página contra las reglas de WCAG 2.1 de nivel A y AA. Una
 * auditoría automática no sustituye a la revisión con personas (no puede
 * juzgar, por ejemplo, si un texto alternativo tiene sentido), pero detecta
 * de forma repetible los fallos objetivos: controles sin nombre accesible,
 * contraste insuficiente, estructura de encabezados o atributos ARIA
 * incorrectos.
 */
export class AccessibilityPageObject {
  constructor(private readonly page: Page) {}

  /** Reglas que se comprueban: WCAG 2.0 y 2.1, niveles A y AA. */
  static readonly WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

  /**
   * Abre una ruta, espera a que la página termine de cargar y la audita.
   * Devuelve un resumen de cada infracción: regla, gravedad (`impact`) y
   * número de elementos afectados.
   */
  async audit(path: string) {
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page: this.page })
      .withTags(AccessibilityPageObject.WCAG_TAGS)
      .analyze();

    return results.violations.map((violation) => ({
      rule: violation.id,
      impact: violation.impact ?? 'unknown',
      description: violation.help,
      nodes: violation.nodes.length,
      targets: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
      // Fragmento del HTML de los primeros elementos, para localizar el
      // componente cuando el selector es un id generado.
      html: violation.nodes.slice(0, 3).map((node) => node.html.slice(0, 160)),
    }));
  }
}
