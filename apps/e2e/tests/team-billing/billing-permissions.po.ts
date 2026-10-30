import type { Page, Request } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { TeamAccountsPageObject } from '../team-accounts/team-accounts.po';
import { BillingPageObject } from '../utils/billing.po';
import { isServerFnResponse } from '../utils/server-fn';

/**
 * Page Object de la facturación de un equipo vista por usuarios con y sin el
 * permiso `billing.manage` (CU-04).
 *
 * Usa el equipo del *seed* («PymeKit»): `owner@pymekit.test` es propietario
 * (tiene el permiso) y `member@pymekit.test` es miembro (no lo tiene).
 */
export class BillingPermissionsPageObject {
  static readonly TEAM_NAME = 'PymeKit';

  readonly auth: AuthPageObject;
  readonly teamAccounts: TeamAccountsPageObject;
  readonly billing: BillingPageObject;

  constructor(private readonly page: Page) {
    this.auth = new AuthPageObject(page);
    this.teamAccounts = new TeamAccountsPageObject(page);
    this.billing = new BillingPageObject(page);
  }

  /** Inicia sesión y deja como cuenta activa el equipo del *seed*. */
  async signInToTeam(email: string) {
    await this.auth.loginAsUser({ email });

    await this.teamAccounts.openAccountsSelector();
    await this.teamAccounts
      .getTeamFromSelector(BillingPermissionsPageObject.TEAM_NAME)
      .first()
      .click();

    await this.teamAccounts.goToBilling();
  }

  cannotManageBillingAlert() {
    return this.page.getByTestId('cannot-manage-billing-alert');
  }

  /**
   * Elige el primer plan y pulsa «Continuar al pago», y devuelve la petición
   * a la *server function* que crea la sesión de pago.
   */
  async requestCheckout(): Promise<Request> {
    await this.billing.selectPlan(0);

    const responsePromise = this.page.waitForResponse((response) =>
      isServerFnResponse(response, { method: 'POST' }),
    );

    await this.billing.proceedToCheckout();

    const response = await responsePromise;

    return response.request();
  }

  /**
   * Repite con la sesión de esta página una petición capturada en otra: así
   * se comprueba el servidor sin pasar por la interfaz, que a este usuario ni
   * siquiera le ofrece el botón.
   */
  async replay(request: Request) {
    const headers = { ...request.headers() };

    // La cookie y el host los pone el contexto de esta página.
    delete headers['cookie'];
    delete headers['host'];
    delete headers['content-length'];

    return this.page.request.post(request.url(), {
      headers,
      data: request.postDataBuffer() ?? undefined,
    });
  }
}
