import type { SupabaseClient } from '@supabase/supabase-js';

import type { PlanTypeMap } from '@pymekit/billing';
import type { Database, Enums } from '@pymekit/supabase/database';

import { createBillingEventHandlerFactoryService } from './billing-event-handler-factory.service.server';
import { createBillingEventHandlerService } from './billing-event-handler.service.server';

// a function that returns a Supabase client
type ClientProvider = () => SupabaseClient<Database>;

// the billing provider from the database
type BillingProvider = Enums<'billing_provider'>;

/**
 * @name getBillingEventHandlerService
 * @description This function retrieves the billing provider from the database and returns a
 * new instance of the `BillingGatewayService` class. This class is used by server functions
 * defined in the host application.
 */
export async function getBillingEventHandlerService(
  clientProvider: ClientProvider,
  provider: BillingProvider,
  planTypesMap: PlanTypeMap,
) {
  const strategy =
    await createBillingEventHandlerFactoryService(planTypesMap).get(provider);

  return createBillingEventHandlerService(clientProvider, strategy);
}
