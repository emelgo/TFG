/**
 * Configuración de la facturación (Stripe): proveedor, productos y planes.
 *
 * Es el punto de reutilización de RF-07: cada pyme sustituye estos planes por
 * los suyos sin tocar el código de la pasarela. Los planes de partida están
 * pensados para una pyme (ADR-024): «Básico», «Profesional» y «Empresa», cada
 * uno con pago mensual y anual (dos meses gratis), en euros.
 *
 * Los precios y los identificadores son DE EJEMPLO. Cada `lineItems[].id`
 * debe ser el id de un precio (`price_...`) creado en el panel de Stripe; el
 * webhook lo usa para saber qué plan se ha contratado. Se leen de variables
 * `VITE_STRIPE_PRICE_*` (públicas: un id de precio no es un secreto) para no
 * tener que editar este fichero en cada entorno. Si no están definidas se
 * usa un valor de relleno `price_ejemplo_*`, que permite arrancar la web y
 * ver la página de precios, pero con el que Stripe rechazará el pago.
 * Ver `docs/CONFIGURACION.md`.
 */
import { BillingProviderSchema, createBillingSchema } from '@pymekit/billing';

// El proveedor sale de `VITE_BILLING_PROVIDER` y debe coincidir con
// `config.billing_provider` en la base de datos. Se valida aquí para que un
// valor erróneo falle al construir, no al primer cobro.
const provider = BillingProviderSchema.parse(
  import.meta.env.VITE_BILLING_PROVIDER,
);

// Proveedores con estrategia registrada en la pasarela
// (packages/billing/gateway/src/server/services/billing-gateway/billing-gateway-registry.server.ts).
// El esquema admite otros nombres, pero sin estrategia fallarían en ejecución.
const registeredProviders: Array<typeof provider> = ['stripe'];

if (!registeredProviders.includes(provider)) {
  throw new Error(
    `Invalid billing provider "${provider}": only ${registeredProviders
      .map((registeredProvider) => `"${registeredProvider}"`)
      .join(
        ', ',
      )} is registered in the billing gateway. Set VITE_BILLING_PROVIDER accordingly, or register the "${provider}" strategy in the billing gateway registry.`,
  );
}

/**
 * Id del precio de Stripe de un plan: el de la variable de entorno si está
 * definida o, si no, un valor de relleno marcado claramente como ejemplo.
 */
function priceId(envValue: string | undefined, example: string) {
  return envValue && envValue.length > 0
    ? envValue
    : `price_ejemplo_${example}`;
}

export default createBillingSchema({
  provider,
  // Las descripciones, insignias y características son claves i18n
  // (`billing.plans.*`); la tabla de precios las traduce con `<Trans>`. El
  // `name` del producto se muestra tal cual donde no hay clave
  // `billing.plans.<id>.name`, por eso ya va en español.
  products: [
    {
      id: 'basic',
      name: 'Básico',
      description: 'billing.plans.basic.description',
      currency: 'EUR',
      badge: 'billing.plans.badges.value',
      plans: [
        {
          name: 'Básico mensual',
          id: 'basic-monthly',
          paymentType: 'recurring',
          interval: 'month',
          lineItems: [
            {
              id: priceId(
                import.meta.env.VITE_STRIPE_PRICE_BASIC_MONTHLY,
                'basico_mensual',
              ),
              name: 'Cuota',
              cost: 19,
              type: 'flat' as const,
            },
          ],
        },
        {
          name: 'Básico anual',
          id: 'basic-yearly',
          paymentType: 'recurring',
          interval: 'year',
          lineItems: [
            {
              id: priceId(
                import.meta.env.VITE_STRIPE_PRICE_BASIC_YEARLY,
                'basico_anual',
              ),
              name: 'Cuota',
              cost: 190,
              type: 'flat' as const,
            },
          ],
        },
      ],
      features: [
        'billing.plans.features.website',
        'billing.plans.features.blog',
        'billing.plans.features.auth',
        'billing.plans.features.cms',
      ],
    },
    {
      id: 'pro',
      name: 'Profesional',
      badge: 'billing.plans.badges.popular',
      highlighted: true,
      description: 'billing.plans.pro.description',
      currency: 'EUR',
      plans: [
        {
          name: 'Profesional mensual',
          id: 'pro-monthly',
          paymentType: 'recurring',
          interval: 'month',
          lineItems: [
            {
              id: priceId(
                import.meta.env.VITE_STRIPE_PRICE_PRO_MONTHLY,
                'profesional_mensual',
              ),
              name: 'Cuota',
              cost: 49,
              type: 'flat' as const,
            },
          ],
        },
        {
          name: 'Profesional anual',
          id: 'pro-yearly',
          paymentType: 'recurring',
          interval: 'year',
          lineItems: [
            {
              id: priceId(
                import.meta.env.VITE_STRIPE_PRICE_PRO_YEARLY,
                'profesional_anual',
              ),
              name: 'Cuota',
              cost: 490,
              type: 'flat' as const,
            },
          ],
        },
      ],
      features: [
        'billing.plans.features.everythingBasic',
        'billing.plans.features.teams',
        'billing.plans.features.roles',
        'billing.plans.features.staff',
      ],
    },
    {
      id: 'enterprise',
      name: 'Empresa',
      description: 'billing.plans.enterprise.description',
      currency: 'EUR',
      plans: [
        {
          name: 'Empresa mensual',
          id: 'enterprise-monthly',
          paymentType: 'recurring',
          interval: 'month',
          lineItems: [
            {
              id: priceId(
                import.meta.env.VITE_STRIPE_PRICE_ENTERPRISE_MONTHLY,
                'empresa_mensual',
              ),
              name: 'Cuota',
              cost: 99,
              type: 'flat' as const,
            },
          ],
        },
        {
          name: 'Empresa anual',
          id: 'enterprise-yearly',
          paymentType: 'recurring',
          interval: 'year',
          lineItems: [
            {
              id: priceId(
                import.meta.env.VITE_STRIPE_PRICE_ENTERPRISE_YEARLY,
                'empresa_anual',
              ),
              name: 'Cuota',
              cost: 990,
              type: 'flat' as const,
            },
          ],
        },
      ],
      features: [
        'billing.plans.features.everythingPro',
        'billing.plans.features.dashboards',
        'billing.plans.features.prioritySupport',
        'billing.plans.features.onboarding',
      ],
    },
  ],
});
