import type { EvaluationResult } from '@pymekit/policies';
import { createPoliciesEvaluator } from '@pymekit/policies';

import { createAccountPolicyRegistry } from './create-account-policies.server';
import type { FeaturePolicyCreateAccountContext } from './feature-policy-create-account-context';

export interface CreateAccountPolicyEvaluator {
  hasPoliciesForStage(stage: 'preliminary' | 'submission'): Promise<boolean>;
  canCreateAccount(
    context: FeaturePolicyCreateAccountContext,
    stage: 'preliminary' | 'submission',
  ): Promise<EvaluationResult>;
}

/**
 * Creates a create account policy evaluator
 */
export function createAccountCreationPolicyEvaluator(): CreateAccountPolicyEvaluator {
  const evaluator =
    createPoliciesEvaluator<FeaturePolicyCreateAccountContext>();

  return {
    /**
     * Checks if there are any create account policies for the given stage
     * @param stage - The stage to check if there are any policies for
     */
    async hasPoliciesForStage(stage: 'preliminary' | 'submission') {
      return evaluator.hasPoliciesForStage(createAccountPolicyRegistry, stage);
    },

    /**
     * Evaluates the create account policies for the given context and stage
     * @param context - The context for the create account policy
     * @param stage - The stage to evaluate the policies for
     */
    async canCreateAccount(
      context: FeaturePolicyCreateAccountContext,
      stage: 'preliminary' | 'submission',
    ) {
      return evaluator.evaluate(
        createAccountPolicyRegistry,
        context,
        'ALL',
        stage,
      );
    },
  };
}
