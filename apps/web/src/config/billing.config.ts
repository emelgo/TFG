/**
 * Replace this file with your own billing configuration.
 * Update the configuration to match your billing provider and products.
 */
import { BillingProviderSchema, createBillingSchema } from '@pymekit/billing';

// The billing provider to use. This should be set in the environment variables
// and should match the provider in the database. We also add it here so we can validate
// your configuration against the selected provider at build time.
const provider = BillingProviderSchema.parse(
  import.meta.env.VITE_BILLING_PROVIDER,
);

// Providers registered in the billing gateway registry
// (packages/billing/gateway/src/server/services/billing-gateway/billing-gateway-registry.server.ts).
// The billing schema also accepts 'lemon-squeezy' and 'paddle', but those
// strategies are not registered in this kit and would only fail at runtime.
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

export default createBillingSchema({
  // also update config.billing_provider in the DB to match the selected
  provider,
  // products configuration. Las descripciones, insignias y características son
  // claves i18n (`billing.plans.*`): la tabla de precios las traduce con
  // `<Trans>` y, si no existieran, mostraría el texto tal cual.
  products: [
    {
      id: 'starter',
      name: 'Starter',
      description: 'billing.plans.starter.description',
      currency: 'USD',
      badge: 'billing.plans.badges.value',
      plans: [
        {
          name: 'Starter Monthly',
          id: 'starter-monthly',
          paymentType: 'recurring',
          interval: 'month',
          lineItems: [
            {
              id: 'price_1PBZTjKgHmU99VeOMbvSb4pO',
              name: 'Starter',
              cost: 9.99,
              type: 'flat' as const,
            },
          ],
        },
        {
          name: 'Starter Yearly',
          id: 'starter-yearly',
          paymentType: 'recurring',
          interval: 'year',
          lineItems: [
            {
              id: 'starter-yearly',
              name: 'Base',
              cost: 99.99,
              type: 'flat' as const,
            },
          ],
        },
      ],
      features: [
        'billing.plans.features.auth',
        'billing.plans.features.teams',
        'billing.plans.features.blog',
      ],
    },
    {
      id: 'pro',
      name: 'Pro',
      badge: 'billing.plans.badges.popular',
      highlighted: true,
      description: 'billing.plans.pro.description',
      currency: 'USD',
      plans: [
        {
          name: 'Pro Monthly',
          id: 'pro-monthly',
          paymentType: 'recurring',
          interval: 'month',
          lineItems: [
            {
              id: 'price_1PGOAVI1i3VnbZTqc69xaypm',
              name: 'Base',
              cost: 19.99,
              type: 'flat',
            },
          ],
        },
        {
          name: 'Pro Yearly',
          id: 'pro-yearly',
          paymentType: 'recurring',
          interval: 'year',
          lineItems: [
            {
              id: 'price_pro_yearly',
              name: 'Base',
              cost: 199.99,
              type: 'flat',
            },
          ],
        },
      ],
      features: [
        'billing.plans.features.auth',
        'billing.plans.features.teams',
        'billing.plans.features.blog',
        'billing.plans.features.roles',
        'billing.plans.features.cms',
      ],
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'billing.plans.enterprise.description',
      currency: 'USD',
      plans: [
        {
          name: 'Enterprise Monthly',
          id: 'enterprise-monthly',
          paymentType: 'recurring',
          interval: 'month',
          lineItems: [
            {
              id: 'price_enterprise-monthly',
              name: 'Base',
              cost: 29.99,
              type: 'flat',
            },
          ],
        },
        {
          name: 'Enterprise Yearly',
          id: 'enterprise-yearly',
          paymentType: 'recurring',
          interval: 'year',
          lineItems: [
            {
              id: 'price_enterprise_yearly',
              name: 'Base',
              cost: 299.9,
              type: 'flat',
            },
          ],
        },
      ],
      features: [
        'billing.plans.features.auth',
        'billing.plans.features.teams',
        'billing.plans.features.blog',
        'billing.plans.features.roles',
        'billing.plans.features.cms',
        'billing.plans.features.prioritySupport',
        'billing.plans.features.onboarding',
      ],
    },
  ],
});
