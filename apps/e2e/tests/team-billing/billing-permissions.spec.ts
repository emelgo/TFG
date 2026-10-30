/**
 * CU-04 · Un miembro sin permiso de facturación no puede gestionarla.
 *
 * La facturación de un equipo exige el permiso `billing.manage`, que en los
 * roles por defecto solo tiene el propietario. Se comprueban las dos barreras
 * de la aplicación (la base de datos la cubren las pruebas pgTAP de
 * facturación):
 *  - la interfaz: el miembro ve un aviso y no el selector de planes;
 *  - el servidor: la petición de pago que hace el propietario, repetida con
 *    la sesión del miembro, se rechaza.
 *
 * Usa los usuarios y el equipo del *seed*. No completa ningún pago.
 *
 * [TFG] RF-06, RF-07, RNF-02 · CU-04.
 */
import { expect, test } from '@playwright/test';

import { BillingPermissionsPageObject } from './billing-permissions.po';

test.describe('Facturación sin permiso (CU-04)', () => {
  test('un miembro sin billing.manage no ve el pago ni puede pedirlo al servidor', async ({
    browser,
  }) => {
    // 1. El propietario sí ve los planes; se captura su petición de pago.
    const ownerContext = await browser.newContext();
    const owner = new BillingPermissionsPageObject(
      await ownerContext.newPage(),
    );

    await owner.signInToTeam('owner@pymekit.test');
    await expect(owner.billing.plans().first()).toBeVisible();

    const checkoutRequest = await owner.requestCheckout();

    // 2. El miembro no ve los planes, sino el aviso.
    const memberContext = await browser.newContext();
    const member = new BillingPermissionsPageObject(
      await memberContext.newPage(),
    );

    await member.signInToTeam('member@pymekit.test');

    await expect(member.cannotManageBillingAlert()).toBeVisible();
    await expect(member.billing.plans()).toHaveCount(0);

    // 3. Y si envía la misma petición de pago con su sesión, el servidor la
    //    rechaza antes de llegar a la pasarela. TanStack Start responde 200 y
    //    serializa el error en el cuerpo, así que se comprueba el contenido:
    //    el error de permiso y ningún `checkoutToken`.
    const response = await member.replay(checkoutRequest);
    const body = await response.text();

    expect(body).toContain('Unauthorized');
    expect(body).not.toContain('checkoutToken');

    await ownerContext.close();
    await memberContext.close();
  });
});
