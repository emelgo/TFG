/**
 * Servicio de facturación de cuentas personales.
 *
 * Equivalente a `team-billing.service.server.ts` para la cuenta personal del
 * usuario: crea la sesión de pago y la del portal del proveedor. En una
 * cuenta personal el id de la cuenta es el id del usuario, así que basta con
 * la sesión para saber sobre qué cuenta se actúa (no se acepta un id del
 * cliente).
 *
 * [TFG] RF-07 Pagos y suscripciones.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type * as z from 'zod';

import { createAccountsApi } from '@pymekit/accounts/api';
import { getProductPlanPair } from '@pymekit/billing';
import { getBillingGatewayProvider } from '@pymekit/billing-gateway';
import { getLogger } from '@pymekit/shared/logger';
import type { Database } from '@pymekit/supabase/database';
import { requireUser } from '@pymekit/supabase/require-user';
import { getSupabaseServerAdminClient } from '@pymekit/supabase/server-admin-client';

import appConfig from '#/config/app.config.ts';
import billingConfig from '#/config/billing.config.ts';
import pathsConfig from '#/config/paths.config.ts';

import type { PersonalAccountCheckoutSchema } from './schema/personal-account-checkout.schema';

/** Crea el servicio con el cliente de Supabase de la petición. */
export function createUserBillingService(client: SupabaseClient<Database>) {
  return new UserBillingService(client);
}

/** Operaciones de facturación de la cuenta personal. */
class UserBillingService {
  private readonly namespace = 'billing.personal-account';

  constructor(private readonly client: SupabaseClient<Database>) {}

  /**
   * Crea una sesión de pago para un plan de la cuenta personal.
   *
   * Devuelve la `url` del pago alojado y/o el `checkoutToken` del pago
   * incrustado. `redirect()` de TanStack solo sirve para rutas internas, así
   * que es el cliente quien navega con `window.location.assign(url)`.
   *
   * @throws Si no hay sesión, si el producto o el plan no existen o si la
   *   pasarela falla.
   */
  async createCheckoutSession({
    planId,
    productId,
  }: z.output<typeof PersonalAccountCheckoutSchema>) {
    const { data: user, error } = await requireUser(this.client);

    if (error ?? !user) {
      throw new Error('Authentication required');
    }

    const service = await getBillingGatewayProvider(this.client);

    // En la cuenta personal, id de cuenta = id de usuario.
    const accountId = user.id;

    const returnUrl = getCheckoutSessionReturnUrl();

    // Si la cuenta ya se cobró antes, se reutiliza su cliente del proveedor.
    const api = createAccountsApi(this.client);
    const customerId = await api.getCustomerId(accountId);

    const product = billingConfig.products.find(
      (item) => item.id === productId,
    );

    if (!product) {
      throw new Error('Product not found');
    }

    const { plan } = getProductPlanPair(billingConfig, planId);

    // El periodo de prueba se concede por persona: si el usuario ya tiene
    // historial de cobro en cualquier cuenta suya (personal o de equipo), no
    // recibe otro, para que no se encadenen pruebas creando cuentas nuevas.
    // Se usa el cliente administrador para leer todas sus cuentas, con la
    // consulta limitada al id del usuario autenticado.
    const ownerHasBillingHistory = await createAccountsApi(
      getSupabaseServerAdminClient(),
    ).ownerHasBillingHistory(accountId);

    const checkoutPlan = ownerHasBillingHistory
      ? { ...plan, trialDays: undefined }
      : plan;

    const logger = await getLogger();

    logger.info(
      {
        name: `billing.personal-account`,
        planId,
        customerId,
        accountId,
      },
      `User requested a personal account checkout session. Contacting provider...`,
    );

    let checkoutToken: string | null | undefined;
    let url: string | null | undefined;

    try {
      const checkout = await service.createCheckoutSession({
        returnUrl,
        accountId,
        customerEmail: user.email,
        customerId,
        plan: checkoutPlan,
        variantQuantities: [],
        enableDiscountField: product.enableDiscountField,
      });

      checkoutToken = checkout.checkoutToken;
      url = checkout.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : error;

      logger.error(
        {
          name: `billing.personal-account`,
          planId,
          customerId,
          accountId,
          error: message,
        },
        `Checkout session not created due to an error`,
      );

      throw new Error(`Failed to create a checkout session`, { cause: error });
    }

    if (!url && !checkoutToken) {
      throw new Error(
        'Checkout session returned neither a URL nor a checkout token',
      );
    }

    logger.info(
      {
        userId: user.id,
      },
      `Checkout session created. Returning result to client...`,
    );

    // El cliente navega a `url` (pago alojado) o pinta el pago incrustado con
    // `checkoutToken`.
    return {
      url: url ?? null,
      checkoutToken: checkoutToken ?? null,
    };
  }

  /**
   * Crea una sesión del portal de facturación del proveedor para la cuenta
   * personal.
   *
   * @returns La URL del portal; la server function la envuelve como `{ url }`
   *   y el cliente navega con `window.location.assign(url)`.
   */
  async createBillingPortalSession() {
    const { data, error } = await requireUser(this.client);

    if (error ?? !data) {
      throw new Error('Authentication required');
    }

    const service = await getBillingGatewayProvider(this.client);
    const logger = await getLogger();

    const accountId = data.id;
    const api = createAccountsApi(this.client);
    const customerId = await api.getCustomerId(accountId);
    const returnUrl = getBillingPortalReturnUrl();

    if (!customerId) {
      throw new Error('Customer not found');
    }

    const ctx = {
      name: this.namespace,
      customerId,
      accountId,
    };

    logger.info(
      ctx,
      `User requested a Billing Portal session. Contacting provider...`,
    );

    let url: string;

    try {
      const session = await service.createBillingPortalSession({
        customerId,
        returnUrl,
      });

      url = session.url;
    } catch (error) {
      logger.error(
        {
          error,
          ...ctx,
        },
        `Failed to create a Billing Portal session`,
      );

      throw new Error(
        `Encountered an error creating the Billing Portal session`,
        { cause: error },
      );
    }

    logger.info(ctx, `Session successfully created.`);

    return url;
  }
}

function getCheckoutSessionReturnUrl() {
  return new URL(
    pathsConfig.app.settingsBillingReturn,
    appConfig.url,
  ).toString();
}

function getBillingPortalReturnUrl() {
  return new URL(pathsConfig.app.settingsBilling, appConfig.url).toString();
}
