/**
 * Registro de políticas.
 *
 * Guarda las definiciones de política por identificador para que cada
 * funcionalidad declare sus reglas en un sitio y las aplicaciones que
 * reutilizan PymeKit puedan añadir las suyas. Se apoya en el registro
 * genérico de `@pymekit/shared/registry`.
 */
import { createRegistry } from '@pymekit/shared/registry';

import type { FeaturePolicyDefinition } from './declarative';
import type { PolicyContext } from './types';

/** Interfaz del registro de políticas. */
export interface PolicyRegistry {
  /** Registra una definición; falla si el identificador ya existe. */
  registerPolicy<
    TContext extends PolicyContext = PolicyContext,
    TConfig = unknown,
  >(
    definition: FeaturePolicyDefinition<TContext, TConfig>,
  ): PolicyRegistry;

  /** Devuelve una definición por su identificador; falla si no existe. */
  getPolicy<TContext extends PolicyContext = PolicyContext, TConfig = unknown>(
    id: string,
  ): Promise<FeaturePolicyDefinition<TContext, TConfig>>;

  /** Indica si existe una política con ese identificador. */
  hasPolicy(id: string): boolean;

  /** Lista los identificadores registrados, en orden de registro. */
  listPolicies(): string[];
}

/** Crea un registro de políticas vacío. */
export function createPolicyRegistry(): PolicyRegistry {
  const baseRegistry = createRegistry<
    FeaturePolicyDefinition<PolicyContext, unknown>,
    string
  >();

  const policyIds = new Set<string>();

  return {
    registerPolicy<
      TContext extends PolicyContext = PolicyContext,
      TConfig = unknown,
    >(definition: FeaturePolicyDefinition<TContext, TConfig>) {
      // Un identificador duplicado sustituiría en silencio una regla, así
      // que se rechaza.
      if (policyIds.has(definition.id)) {
        throw new Error(
          `Policy with ID "${definition.id}" is already registered`,
        );
      }

      baseRegistry.register(definition.id, () => definition);
      policyIds.add(definition.id);

      return this;
    },

    async getPolicy<
      TContext extends PolicyContext = PolicyContext,
      TConfig = unknown,
    >(id: string) {
      if (!policyIds.has(id)) {
        throw new Error(`Policy with ID "${id}" is not registered`);
      }

      return baseRegistry.get(id) as Promise<
        FeaturePolicyDefinition<TContext, TConfig>
      >;
    },

    hasPolicy(id: string) {
      return policyIds.has(id);
    },

    listPolicies() {
      return Array.from(policyIds);
    },
  };
}
