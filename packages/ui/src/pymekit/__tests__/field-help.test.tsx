/**
 * Pruebas del botón de ayuda de campo (`@pymekit/ui/field-help`),
 * renderizado en el servidor (sin navegador): se comprueba lo que no se ve
 * en un E2E a simple vista — que el botón no envía el formulario, que tiene
 * nombre accesible en español y que sin texto de ayuda no aparece el «?».
 * La apertura del *popover* con clic se prueba en el E2E
 * (`apps/e2e/tests/cms/cms-field-help.spec.ts`).
 */
import type { ReactNode } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { IntlProvider } from 'use-intl';
import { describe, expect, it } from 'vitest';

import messages from '../../../../i18n/src/messages/es/common.json';
import { FieldHelp, FieldLabelWithHelp } from '../field-help';

function render(node: ReactNode) {
  return renderToStaticMarkup(
    <IntlProvider locale="es" messages={{ common: messages }} timeZone="UTC">
      {node}
    </IntlProvider>,
  );
}

describe('FieldHelp', () => {
  it('es un botón que no envía el formulario, con nombre accesible', () => {
    const html = render(
      <FieldHelp label="Zona horaria">Texto de ayuda</FieldHelp>,
    );

    expect(html).toContain('type="button"');
    expect(html).toContain('data-testid="field-help"');
    expect(html).toContain('aria-label="Ayuda: Zona horaria"');
  });
});

describe('FieldLabelWithHelp', () => {
  it('pinta el «?» junto a la etiqueta y lo nombra con ella', () => {
    const html = render(
      <FieldLabelWithHelp htmlFor="tz" id="tz-label" help="Texto de ayuda">
        Zona horaria
      </FieldLabelWithHelp>,
    );

    expect(html).toContain('data-testid="field-help"');
    expect(html).toMatch(/aria-labelledby="[^"]+ tz-label"/);
    expect(html).toContain('Ayuda:');
  });

  it('sin ayuda solo pinta la etiqueta', () => {
    const html = render(
      <FieldLabelWithHelp htmlFor="tz" help="">
        Zona horaria
      </FieldLabelWithHelp>,
    );

    expect(html).not.toContain('field-help');
    expect(html).toContain('Zona horaria');
  });
});
