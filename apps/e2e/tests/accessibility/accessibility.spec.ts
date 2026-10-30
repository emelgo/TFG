/**
 * Auditoría automática de accesibilidad de las pantallas principales (RNF-08).
 *
 * Recorre la web pública (visitante), el área privada (propietario de un
 * equipo) y la consola (super-admin con MFA) y audita cada pantalla con
 * axe-core contra WCAG 2.1 A y AA. La prueba falla si aparece alguna
 * infracción de gravedad «seria» o «crítica»; las de gravedad menor se
 * adjuntan al informe para revisarlas, sin bloquear.
 *
 * Solo lee: no guarda nada.
 *
 * [TFG] RNF-08.
 */
import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { AccessibilityPageObject } from './accessibility.po';

const BLOCKING_IMPACTS = ['serious', 'critical'];

const AREAS = [
  {
    name: 'Web pública',
    session: undefined,
    paths: [
      '/',
      '/pricing',
      '/blog',
      '/faq',
      '/contact',
      '/auth/sign-in',
      '/auth/sign-up',
    ],
  },
  {
    name: 'Área privada',
    session: AUTH_STATES.OWNER_USER,
    paths: ['/dashboard', '/settings', '/settings/members'],
  },
  {
    name: 'Consola',
    session: AUTH_STATES.SUPER_ADMIN,
    paths: [
      '/admin',
      '/admin/cms/resources/public/blog_posts',
      '/admin/cms/resources/public/blog_posts/new',
      '/admin/cms/users',
      '/admin/cms/audit-logs',
    ],
  },
];

for (const area of AREAS) {
  test.describe(`Accesibilidad: ${area.name}`, () => {
    if (area.session) {
      AuthPageObject.setupSession(area.session);
    }

    for (const path of area.paths) {
      test(`${path} sin infracciones graves de WCAG 2.1 AA`, async ({
        page,
      }, testInfo) => {
        const accessibility = new AccessibilityPageObject(page);
        const violations = await accessibility.audit(path);

        await testInfo.attach('axe-violations', {
          body: JSON.stringify(violations, null, 2),
          contentType: 'application/json',
        });

        const blocking = violations.filter((violation) =>
          BLOCKING_IMPACTS.includes(violation.impact),
        );

        expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
      });
    }
  });
}
