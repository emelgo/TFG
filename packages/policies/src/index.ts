// API pública del paquete de políticas de negocio.

// Tipos base.
export type { PolicyContext, PolicyResult, PolicyStage } from './types';

// Definición declarativa de políticas.
export { definePolicy } from './declarative';
export type {
  FeaturePolicyDefinition,
  PolicyEvaluator,
  PolicyErrorCode,
  PolicyReason,
} from './declarative';

// Registro de políticas.
export { createPolicyRegistry } from './registry';
export type { PolicyRegistry } from './registry';

// Evaluador y funciones puente entre el registro y las funciones simples.
export {
  createPolicy,
  createPoliciesEvaluator,
  createPolicyFromRegistry,
  createPoliciesFromRegistry,
} from './evaluator';

export type {
  PolicyFunction,
  PolicyGroup,
  EvaluationResult,
} from './evaluator';

// Ayudas para implementar políticas.
export { allow, deny } from './evaluator';
