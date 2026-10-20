/**
 * Prueba E2E del escenario de evaluación «Fisioterapia Bahía» (F6, CU-07).
 *
 * Recorre el flujo completo de la funcionalidad añadida sobre la plataforma:
 *
 *  1. Un visitante sin sesión abre «Pedir cita», comprueba que la ayuda «?»
 *     funciona y envía una solicitud.
 *  2. El super-admin (raíz del CMS) encuentra la solicitud en el área
 *     «Citas» de la consola, con los nombres y etiquetas en español.
 *
 * El nombre lleva un sufijo aleatorio para que la prueba no dependa de lo
 * que haya en la base de datos ni choque con ejecuciones anteriores.
 *
 * [TFG] RNF-01 · CU-07.
 */
import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { CmsPageObject } from '../cms/cms.po';
import { DataExplorerPageObject } from '../cms/data-explorer.po';
import { AUTH_STATES } from '../utils/auth-state';
import { AppointmentsPageObject } from './appointments.po';

const suffix = Math.random().toString(36).slice(2, 8);
const patientName = `Paciente E2E ${suffix}`;

/** Fecha `AAAA-MM-DD` dentro de una semana. */
function nextWeek() {
  const date = new Date();
  date.setDate(date.getDate() + 7);

  return date.toISOString().slice(0, 10);
}

test.describe.serial('Escenario «Fisioterapia Bahía»: pedir cita', () => {
  test('un visitante envía una solicitud de cita', async ({ page }) => {
    const appointments = new AppointmentsPageObject(page);

    await appointments.goto();

    // Enviar vacío muestra los errores de validación en español
    await appointments.submitEmptyUntilValidated();
    await expect(appointments.form()).toContainText('Escribe tu nombre.');

    // La ayuda «?» del teléfono se abre y explica el campo
    await appointments.helpButton(/Teléfono/).click();
    await expect(appointments.helpContent()).toContainText(
      'prefijo internacional',
    );
    await page.keyboard.press('Escape');

    await appointments.fill({
      fullName: patientName,
      email: `paciente-${suffix}@example.com`,
      phone: '+34 600 123 456',
      service: 'sports_injury',
      preferredDate: nextWeek(),
      message: 'Esguince de tobillo jugando al pádel',
    });

    await appointments.submit();

    await expect(appointments.successAlert()).toBeVisible();
  });

  test.describe('consola del CMS', () => {
    AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

    test('el super-admin ve la solicitud en el área «Citas»', async ({
      page,
    }) => {
      const cms = new CmsPageObject(page);
      const explorer = new DataExplorerPageObject(page);

      await page.goto('/admin');

      await cms.openSidebarArea('Citas');
      await expect(
        cms.sidebarResource('public.appointment_requests'),
      ).toContainText('Solicitudes de cita');

      await explorer.goto('public', 'appointment_requests');
      await expect(explorer.title()).toContainText('Solicitudes de cita');

      await explorer.search(patientName);
      await explorer.expectRowsContain(patientName);

      // El enumerado se muestra con su etiqueta en español, no con el valor
      const row = explorer.rows().first();
      await expect(row).toContainText('Lesión deportiva');
      await expect(row).toContainText('Pendiente');
    });
  });
});
