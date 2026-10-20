/**
 * Servicio de facturación de cuentas de equipo.
 *
 * Crea las sesiones de pago (*checkout*) y del portal de facturación del
 * proveedor (Stripe) para un equipo. Lo llaman las *server functions* de
 * `billing.functions.ts`; antes de hablar con la pasarela comprueba de nuevo
 * la sesión y el permiso `billing.manage`, de modo que la autorización no
 * depende solo del *middleware*. La pasarela concreta la elige
 * `getBillingGatewayProvider` según la configuración.
 *
 * [TFG] RF-07 Pagos y suscripciones.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type * as z from 'zod';

import { createAccountsApi } from '@pymekit/accounts/api';
import type { LineItemSchema } from '@pymekit/billing';
import { getBillingGatewayProvider } from '@pymekit/billing-gateway';
import { getLogger } from '@pymekit/shared/logger';
import type { Database } from '@pymekit/supabase/database';
import { requireUser } from '@pymekit/supabase/require-user';
import { getSupabaseServerAdminClient } from '@pymekit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';
import { createTeamAccountsApi } from '@pymekit/team-accounts/api';

import appConfig from '#/config/app.config.ts';
import billingConfig from '#/config/billing.config.ts';
import pathsConfig from '#/config/paths.config.ts';

import type { TeamCheckoutSchema } from './schema/team-billing.schema';

/** Crea el servicio con el cliente de Supabase de la petición. */
export function createTeamBillingService(client: SupabaseClient<Database>) {
  return new TeamBillingService(client);
}

/** Operaciones de facturación de una cuenta de equipo. */
class TeamBillingService {
  private readonly namespace = 'billing.team-account';

  constructor(private readonly client: SupabaseClient<Database>) {}

  /**
   * Crea una sesión de pago para un plan del equipo.
   *
   * Devuelve la `url` del pago alojado por el proveedor y/o el
   * `checkoutToken` del pago incrustado. No redirige desde el servidor porque
   * `redirect()` de TanStack no admite URL externas: el cliente navega con
   * `window.location.assign(url)`.
   *
   * @throws Si no hay sesión, si falta el permiso `billing.manage` o si la
   *   pasarela no crea la sesión.
   */
  async createCheckout(params: z.output<typeof TeamCheckoutSchema>) {
    const { data: user } = await requireUser(this.client);

    if (!user) {
      throw new Error('Authentication required');
    }

    const userId = user.id;
    const accountId = params.accountId;
    const logger = await getLogger();

    const ctx = {
      userId,
      accountId,
      name: this.namespace,
    };

    logger.info(ctx, `Requested checkout session. Processing...`);

    const api = createTeamAccountsApi(this.client);

    // Defensa en profundidad: se repite aquí la comprobación del permiso
    // `billing.manage`, aunque la server function ya la haga.
    const hasPermission = await api.hasPermission({
      userId,
      accountId,
      permission: 'billing.manage',
    });

    if (!hasPermission) {
      logger.warn(
        ctx,
        `User without permissions attempted to create checkout.`,
      );

      throw new Error('Permission denied');
    }

    const service = await getBillingGatewayProvider(this.client);

    // El plan se toma de billing.config.ts, nunca de lo que envía el cliente,
    // para que no se pueda manipular el precio.
    const { plan, product } = getPlanDetails(params.productId, params.planId);

    // El periodo de prueba se concede por persona, no por cuenta: si el usuario
    // ya tiene historial de cobro en alguna cuenta suya, no recibe otro. Así se
    // evita encadenar pruebas gratuitas creando equipos nuevos (la comprobación
    // del cliente por cuenta solo cubre cuentas ya cobradas).
    // Se usa el cliente administrador porque hay que leer todas las cuentas del
    // usuario, no solo las que la RLS deja ver en este contexto; la consulta se
    // limita al id del usuario autenticado y se hace después de comprobar el
    // permiso.
    const ownerHasBillingHistory = await createAccountsApi(
      getSupabaseServerAdminClient(),
    ).ownerHasBillingHistory(userId);

    const checkoutPlan = ownerHasBillingHistory
      ? { ...plan, trialDays: undefined }
      : plan;

    // Si la cuenta ya se cobró antes, se reutiliza su cliente del proveedor.
    const customerId = await api.getCustomerId(accountId);
    const customerEmail = user.email;

    const returnUrl = getCheckoutSessionReturnUrl(params.slug);

    // Cantidad inicial de las líneas por puesto (número actual de miembros).
    const variantQuantities = await this.getVariantQuantities(
      plan.lineItems,
      accountId,
    );

    logger.info(
      {
        ...ctx,
        planId: plan.id,
      },
      `Creating checkout session...`,
    );

    let checkoutToken: string | null | undefined;
    let url: string | null | undefined;

    try {
      const checkout = await service.createCheckoutSession({
        accountId,
        plan: checkoutPlan,
        returnUrl,
        customerEmail,
        customerId,
        variantQuantities,
        enableDiscountField: product.enableDiscountField,
      });

      checkoutToken = checkout.checkoutToken;
      url = checkout.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : error;

      logger.error(
        {
          ...ctx,
          error: message,
        },
        `Error creating the checkout session`,
      );

      throw new Error(`Checkout not created`, { cause: error });
    }

    if (!url && !checkoutToken) {
      throw new Error(
        'Checkout session returned neither a URL nor a checkout token',
      );
    }

    logger.info(ctx, `Checkout session created. Returning result to client...`);

    // El cliente navega a `url` (pago alojado) o pinta el pago incrustado con
    // `checkoutToken`.
    return {
      url: url ?? null,
      checkoutToken: checkoutToken ?? null,
    };
  }

  /**
   * Crea una sesión del portal de facturación del proveedor, donde el equipo
   * gestiona su suscripción, métodos de pago y facturas.
   *
   * Devuelve la `url` del portal; la server function la envuelve como
   * `{ url }` y el cliente navega con `window.location.assign(url)`.
   *
   * @throws Si no hay sesión, si falta `billing.manage` o si la cuenta aún no
   *   tiene cliente en el proveedor.
   */
  async createBillingPortalSession({
    accountId,
    slug,
  }: {
    accountId: string;
    slug: string;
  }) {
    const client = getSupabaseServerClient();
    const logger = await getLogger();

    logger.info(
      {
        accountId,
        name: this.namespace,
      },
      `Billing portal session requested. Processing...`,
    );

    const { data: user, error } = await requireUser(client);

    if (error ?? !user) {
      throw new Error('Authentication required');
    }

    const userId = user.id;

    const api = createTeamAccountsApi(client);

    // Defensa en profundidad: mismo permiso que en createCheckout.
    const hasPermission = await api.hasPermission({
      userId,
      accountId,
      permission: 'billing.manage',
    });

    if (!hasPermission) {
      logger.warn(
        {
          userId,
          accountId,
          name: this.namespace,
        },
        `User without permissions attempted to create billing portal session.`,
      );

      throw new Error('Permission denied');
    }

    const customerId = await api.getCustomerId(accountId);

    if (!customerId) {
      throw new Error('Customer not found');
    }

    logger.info(
      {
        userId,
        customerId,
        accountId,
        name: this.namespace,
      },
      `Creating billing portal session...`,
    );

    const service = await getBillingGatewayProvider(client);

    try {
      const returnUrl = getBillingPortalReturnUrl(slug);

      const { url } = await service.createBillingPortalSession({
        customerId,
        returnUrl,
      });

      return url;
    } catch (error) {
      logger.error(
        {
          userId,
          customerId,
          accountId,
          name: this.namespace,
          error,
        },
        `Billing Portal session was not created`,
      );

      throw new Error(`Error creating Billing Portal`, { cause: error });
    }
  }

  /**
   * Calcula la cantidad inicial de las líneas por puesto (`per_seat`): el
   * número actual de miembros del equipo.
   */
  private async getVariantQuantities(
    lineItems: z.output<typeof LineItemSchema>[],
    accountId: string,
  ) {
    const variantQuantities: Array<{
      quantity: number;
      variantId: string;
    }> = [];

    for (const lineItem of lineItems) {
      const isPerSeat = lineItem.type === 'per_seat';

      if (isPerSeat) {
        const quantity = await this.getCurrentMembersCount(accountId);

        const item = {
          quantity,
          variantId: lineItem.id,
        };

        variantQuantities.push(item);
      }
    }

    return variantQuantities;
  }

  private async getCurrentMembersCount(accountId: string) {
    const api = createTeamAccountsApi(this.client);
    const logger = await getLogger();

    try {
      const count = await api.getMembersCount(accountId);

      return count ?? 1;
    } catch (error) {
      logger.error(
        {
          accountId,
          error,
          name: `billing.checkout`,
        },
        `Encountered an error while fetching the number of existing seats`,
      );

      return Promise.reject(error as Error);
    }
  }
}

function getCheckoutSessionReturnUrl(accountSlug: string) {
  return getAccountUrl(pathsConfig.app.settingsBillingReturn, accountSlug);
}

function getBillingPortalReturnUrl(accountSlug: string) {
  return getAccountUrl(pathsConfig.app.settingsBilling, accountSlug);
}

/** Construye la URL absoluta de una página del equipo sustituyendo `[account]`. */
function getAccountUrl(path: string, slug: string) {
  return new URL(path, appConfig.url).toString().replace('[account]', slug);
}

/** Busca el producto y el plan en la configuración de facturación. */
function getPlanDetails(productId: string, planId: string) {
  const product = billingConfig.products.find(
    (product) => product.id === productId,
  );

  if (!product) {
    throw new Error('Product not found');
  }

  const plan = product?.plans.find((plan) => plan.id === planId);

  if (!plan) {
    throw new Error('Plan not found');
  }

  return { plan, product };
}
