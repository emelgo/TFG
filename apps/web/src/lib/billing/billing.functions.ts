/**
 * *Server functions* de facturación.
 *
 * Son la frontera entre la página `/settings/billing` y los servicios de
 * facturación: cargan los datos de suscripción y pedidos de la cuenta activa
 * y crean las sesiones de pago y del portal del proveedor. Cada una comprueba
 * que el cobro del tipo de cuenta esté activado en `feature-flags.config.ts`
 * y, en las de equipo, el permiso `billing.manage` mediante *middleware*; los
 * servicios lo vuelven a comprobar.
 *
 * [TFG] RF-07 Pagos y suscripciones.
 */
import { notFound, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import * as z from 'zod';

import { createAccountsApi } from '@pymekit/accounts/api';
import {
  getBillingGatewayProvider,
  resolveProductPlan,
} from '@pymekit/billing-gateway';
import { authFunctionMiddleware } from '@pymekit/function-middleware/functions';
import {
  authMiddleware,
  errorMiddleware,
  withFeaturePermission,
} from '@pymekit/function-middleware/server';
import { requireUser } from '@pymekit/supabase/require-user';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

import billingConfig from '#/config/billing.config.ts';
import featureFlagsConfig from '#/config/feature-flags.config.ts';
import pathsConfig from '#/config/paths.config.ts';

import { PersonalAccountCheckoutSchema } from './schema/personal-account-checkout.schema';
import {
  TeamBillingPortalSchema,
  TeamCheckoutSchema,
} from './schema/team-billing.schema';
import { createTeamBillingService } from './team-billing.service.server';
import { createUserBillingService } from './user-billing.service.server';

/**
 * Carga los datos de la página de facturación (`/settings/billing`) para la
 * cuenta activa, sea personal (id de cuenta = id de usuario) o de equipo.
 *
 * Si el cobro de ese tipo de cuenta está desactivado, redirige a
 * `/settings`. Devuelve `isPersonalAccount` y los `permissions` de la cuenta
 * activa para que la página elija el formulario adecuado y sepa si mostrar
 * las acciones de `billing.manage`. La cuenta activa se resuelve en el
 * servidor (`active_account_workspace`), no se acepta del cliente.
 */
export const fetchActiveAccountBillingData = createServerFn({ method: 'GET' })
  .middleware([errorMiddleware])
  .handler(async () => {
    const client = getSupabaseServerClient();

    const auth = await requireUser(client);

    if (auth.error) {
      throw redirect({ href: auth.redirectTo });
    }

    const workspace = await client.rpc('active_account_workspace');

    if (workspace.error) {
      throw workspace.error;
    }

    const account = workspace.data[0];

    if (!account) {
      throw redirect({ href: pathsConfig.app.settings });
    }

    const isPersonalAccount = !!account.is_personal_account;

    const billingEnabled = isPersonalAccount
      ? featureFlagsConfig.enablePersonalAccountBilling
      : featureFlagsConfig.enableTeamAccountBilling;

    if (!billingEnabled) {
      throw redirect({ href: pathsConfig.app.settings });
    }

    const accountId = account.id;
    const api = createAccountsApi(client);

    const [subscription, order, customerId] = await Promise.all([
      api.getSubscription(accountId),
      api.getOrder(accountId),
      api.getCustomerId(accountId),
    ]);

    const subscriptionVariantId = subscription?.items[0]?.variant_id;
    const orderVariantId = order?.items[0]?.variant_id;

    const subscriptionProductPlan =
      subscription && subscriptionVariantId
        ? await resolveProductPlan(
            billingConfig,
            subscriptionVariantId,
            subscription.currency,
          )
        : null;

    const orderProductPlan =
      order && orderVariantId
        ? await resolveProductPlan(
            billingConfig,
            orderVariantId,
            order.currency,
          )
        : null;

    return {
      isPersonalAccount,
      accountId,
      slug: account.slug,
      permissions: account.permissions ?? [],
      subscription,
      order,
      customerId,
      subscriptionProductPlan,
      orderProductPlan,
    };
  });

const SessionSchema = z.object({
  sessionId: z.string().min(1),
});

// Tupla de middleware de las funciones de facturación de equipo: sesión y
// permiso `billing.manage` sobre el `accountId` de la entrada.
const billingManageMiddleware = [
  errorMiddleware,
  authMiddleware,
  withFeaturePermission('billing.manage'),
];

/**
 * Recupera la sesión de pago para la página de retorno de facturación (común
 * a cuentas personales y de equipo).
 *
 * Si la sesión sigue abierta devuelve el `checkoutToken` para reanudar el
 * pago incrustado; si no, el estado y el email del cliente para la pantalla
 * de confirmación. Si la sesión no existe, responde `notFound()`.
 */
export const fetchCheckoutSession = createServerFn({ method: 'GET' })
  .middleware([errorMiddleware])
  .validator(SessionSchema)
  .handler(async ({ data }) => {
    const client = getSupabaseServerClient();

    const auth = await requireUser(client);

    if (auth.error) {
      throw redirect({ href: auth.redirectTo });
    }

    const gateway = await getBillingGatewayProvider(client);

    const session = await gateway.retrieveCheckoutSession({
      sessionId: data.sessionId,
    });

    if (!session) {
      throw notFound();
    }

    return {
      status: session.status,
      customerEmail: session.customer.email,
      checkoutToken: session.isSessionOpen ? session.checkoutToken : null,
    };
  });

/**
 * Crea una sesión de pago para la cuenta personal.
 *
 * Devuelve `{ url, checkoutToken }`: el cliente navega a `url` (pago alojado,
 * con `window.location.assign`) o pinta el pago incrustado con
 * `checkoutToken`.
 */
export const createPersonalAccountCheckoutSession = createServerFn({
  method: 'POST',
})
  .middleware(authFunctionMiddleware)
  .validator(PersonalAccountCheckoutSchema)
  .handler(async ({ data }) => {
    if (!featureFlagsConfig.enablePersonalAccountBilling) {
      throw new Error('Personal account billing is not enabled');
    }

    const client = getSupabaseServerClient();
    const service = createUserBillingService(client);

    return service.createCheckoutSession(data);
  });

/**
 * Crea una sesión del portal de facturación para la cuenta personal.
 *
 * La URL es externa, así que se devuelve al cliente para que navegue con
 * `window.location.assign(url)`.
 */
export const createPersonalAccountBillingPortalSession = createServerFn({
  method: 'POST',
})
  .middleware(authFunctionMiddleware)
  .handler(async () => {
    if (!featureFlagsConfig.enablePersonalAccountBilling) {
      throw new Error('Personal account billing is not enabled');
    }

    const client = getSupabaseServerClient();
    const service = createUserBillingService(client);

    const url = await service.createBillingPortalSession();

    return { url };
  });

/**
 * Crea una sesión de pago para una cuenta de equipo.
 *
 * Exige el permiso `billing.manage` en la cuenta; la entrada validada lleva
 * el `accountId` (uuid) que necesita la guarda, y el servicio vuelve a
 * comprobar el permiso.
 */
export const createTeamAccountCheckoutSession = createServerFn({
  method: 'POST',
})
  .middleware(billingManageMiddleware)
  .validator(TeamCheckoutSchema)
  .handler(async ({ data }) => {
    if (!featureFlagsConfig.enableTeamAccountBilling) {
      throw new Error('Team account billing is not enabled');
    }

    const client = getSupabaseServerClient();
    const service = createTeamBillingService(client);

    return service.createCheckout(data);
  });

/**
 * Crea una sesión del portal de facturación para una cuenta de equipo.
 *
 * Exige el permiso `billing.manage`. La URL es externa, así que se devuelve
 * al cliente para que navegue con `window.location.assign(url)`.
 */
export const createTeamAccountBillingPortalSession = createServerFn({
  method: 'POST',
})
  .middleware(billingManageMiddleware)
  .validator(TeamBillingPortalSchema)
  .handler(async ({ data }) => {
    if (!featureFlagsConfig.enableTeamAccountBilling) {
      throw new Error('Team account billing is not enabled');
    }

    const client = getSupabaseServerClient();
    const service = createTeamBillingService(client);

    const url = await service.createBillingPortalSession(data);

    return { url };
  });
