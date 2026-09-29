import type { PolicyContext } from '@pymekit/policies';

/**
 * Minimal context for create account policies.
 * Policies can fetch additional data internally using getSupabaseServerClient().
 */
export interface FeaturePolicyCreateAccountContext extends PolicyContext {
  /** The ID of the user creating the account */
  userId: string;

  /** The name of the account being created (empty string for preliminary checks) */
  accountName: string;
}
