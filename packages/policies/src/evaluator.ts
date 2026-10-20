/**
 * Evaluador de políticas.
 *
 * Ejecuta un conjunto de políticas sobre un contexto y combina sus
 * resultados con lógica ALL (todas deben permitir) o ANY (basta con una),
 * cortando en cuanto el resultado está decidido. Admite dos estilos: el
 * registro de definiciones declarativas (`definePolicy` + `PolicyRegistry`) y
 * funciones de política sueltas agrupadas en `PolicyGroup`. Lo usan, por
 * ejemplo, las reglas de invitación y de creación de equipos de
 * `@pymekit/team-accounts`.
 */
import type { FeaturePolicyDefinition, PolicyErrorCode } from './declarative';
import type { PolicyRegistry } from './registry';
import type { PolicyContext, PolicyResult, PolicyStage } from './types';

const OPERATORS = {
  ALL: 'ALL' as const,
  ANY: 'ANY' as const,
};

type Operator = (typeof OPERATORS)[keyof typeof OPERATORS];

/** Política expresada como una función asíncrona simple. */
export type PolicyFunction<TContext extends PolicyContext = PolicyContext> = (
  context: Readonly<TContext>,
  stage?: PolicyStage,
) => Promise<PolicyResult>;

/** Grupo de políticas que se combinan con un operador ALL o ANY. */
export interface PolicyGroup<TContext extends PolicyContext = PolicyContext> {
  operator: Operator;
  policies: PolicyFunction<TContext>[];
}

/** Resultado agregado de una evaluación. */
export interface EvaluationResult {
  allowed: boolean;
  reasons: string[];
  results: PolicyResult[];
}

/**
 * Caché LRU (se descarta lo menos usado recientemente) de definiciones de
 * política, con tamaño máximo para acotar la memoria.
 */
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);

    if (value !== undefined) {
      // Un Map conserva el orden de inserción: reinsertar la clave la pasa al
      // final (la más reciente).
      this.cache.delete(key);
      this.cache.set(key, value);
    }

    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // La primera clave es la usada hace más tiempo.
      const firstKey = this.cache.keys().next().value;

      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/** Evaluador de políticas con caché de definiciones por registro. */
export class PoliciesEvaluator<TContext extends PolicyContext = PolicyContext> {
  // WeakMap: si un registro deja de usarse, su caché puede liberarse junto a
  // él.
  private registryPolicyCache = new WeakMap<
    PolicyRegistry,
    LRUCache<string, FeaturePolicyDefinition<TContext>>
  >();

  private readonly maxCacheSize: number;

  constructor(options?: { maxCacheSize?: number }) {
    this.maxCacheSize = options?.maxCacheSize ?? 100;
  }

  private async getCachedPolicy(
    registry: PolicyRegistry,
    policyId: string,
  ): Promise<FeaturePolicyDefinition<TContext> | undefined> {
    if (!this.registryPolicyCache.has(registry)) {
      this.registryPolicyCache.set(registry, new LRUCache(this.maxCacheSize));
    }

    const cache = this.registryPolicyCache.get(registry)!;

    let definition = cache.get(policyId);

    if (!definition) {
      definition = await registry.getPolicy<TContext>(policyId);

      if (definition) {
        cache.set(policyId, definition);
      }
    }

    return definition;
  }

  /** Vacía la caché (útil en pruebas o para liberar memoria). */
  clearCache(): void {
    // Un WeakMap no se puede vaciar; se sustituye por uno nuevo.
    this.registryPolicyCache = new WeakMap();
  }

  /** Indica si el registro tiene alguna política aplicable a la fase. */
  async hasPoliciesForStage(
    registry: PolicyRegistry,
    stage?: PolicyStage,
  ): Promise<boolean> {
    const policyIds = registry.listPolicies();

    for (const policyId of policyIds) {
      const definition = await this.getCachedPolicy(registry, policyId);

      if (!definition) {
        continue;
      }

      if (!stage) {
        return true;
      }

      if (!definition.stages) {
        return true;
      }

      if (definition.stages.includes(stage)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Evalúa todas las políticas del registro aplicables a la fase y combina
   * sus resultados con ALL (por defecto) o ANY.
   */
  async evaluate(
    registry: PolicyRegistry,
    context: TContext,
    operator: Operator = OPERATORS.ALL,
    stage?: PolicyStage,
  ): Promise<EvaluationResult> {
    const results: PolicyResult[] = [];
    const reasons: string[] = [];
    const policyIds = registry.listPolicies();

    for (const policyId of policyIds) {
      const definition = await this.getCachedPolicy(registry, policyId);

      if (!definition) {
        continue;
      }

      if (stage && definition.stages && !definition.stages.includes(stage)) {
        continue;
      }

      const evaluator = definition.create(context);
      const result = await evaluator.evaluate(stage);

      results.push(result);

      if (!result.allowed && result.reason) {
        reasons.push(result.reason);
      }

      if (operator === OPERATORS.ALL && !result.allowed) {
        return { allowed: false, reasons, results };
      }

      if (operator === OPERATORS.ANY && result.allowed) {
        return { allowed: true, reasons: [], results };
      }
    }

    // Con ANY y ninguna política aplicable no hay nada que permita la acción,
    // así que se rechaza.
    if (results.length === 0 && operator === OPERATORS.ANY) {
      return {
        allowed: false,
        reasons: ['No policies matched the criteria'],
        results: [],
      };
    }

    const allowed =
      operator === OPERATORS.ALL
        ? results.every((r) => r.allowed)
        : results.some((r) => r.allowed);

    return { allowed, reasons: allowed ? [] : reasons, results };
  }

  /** Evalúa un grupo de políticas con su operador. */
  async evaluateGroup(
    group: PolicyGroup<TContext>,
    context: TContext,
    stage?: PolicyStage,
  ): Promise<EvaluationResult> {
    const results: PolicyResult[] = [];
    const reasons: string[] = [];

    for (const policy of group.policies) {
      const result = await policy(Object.freeze({ ...context }), stage);
      results.push(result);

      if (!result.allowed && result.reason) {
        reasons.push(result.reason);
      }

      // Cortocircuito: en cuanto el resultado está decidido se deja de
      // evaluar.
      if (group.operator === OPERATORS.ALL && !result.allowed) {
        return {
          allowed: false,
          reasons,
          results,
        };
      }

      if (group.operator === OPERATORS.ANY && result.allowed) {
        return {
          allowed: true,
          reasons: [],
          results,
        };
      }
    }

    const allowed =
      group.operator === OPERATORS.ALL
        ? results.every((r) => r.allowed)
        : results.some((r) => r.allowed);

    return {
      allowed,
      reasons: allowed ? [] : reasons,
      results,
    };
  }

  /** Evalúa varios grupos en orden; todos deben permitir la acción. */
  async evaluateGroups(
    groups: PolicyGroup<TContext>[],
    context: TContext,
    stage?: PolicyStage,
  ): Promise<EvaluationResult> {
    const allResults: PolicyResult[] = [];
    const allReasons: string[] = [];

    for (const group of groups) {
      const groupResult = await this.evaluateGroup(group, context, stage);
      allResults.push(...groupResult.results);
      allReasons.push(...groupResult.reasons);

      // Se detiene en el primer grupo que rechaza.
      if (!groupResult.allowed) {
        return {
          allowed: false,
          reasons: allReasons,
          results: allResults,
        };
      }
    }

    return {
      allowed: true,
      reasons: [],
      results: allResults,
    };
  }

  /** Evalúa una lista de funciones de política con ALL o ANY. */
  async evaluatePolicies(
    policies: PolicyFunction<TContext>[],
    context: TContext,
    operator: Operator = OPERATORS.ALL,
    stage?: PolicyStage,
  ) {
    return this.evaluateGroup({ operator, policies }, context, stage);
  }
}

/** Crea una función de política (ayuda de tipado). */
export function createPolicy<TContext extends PolicyContext = PolicyContext>(
  evaluate: (
    context: Readonly<TContext>,
    stage?: PolicyStage,
  ) => Promise<PolicyResult>,
): PolicyFunction<TContext> {
  return evaluate;
}

/** Crea un resultado que permite la acción. */
export const allow = (metadata?: Record<string, unknown>): PolicyResult => ({
  allowed: true,
  metadata,
});

/**
 * Crea un resultado que rechaza la acción. Admite un motivo en texto o un
 * error estructurado (sobrecargas).
 */
export function deny(
  reason: string,
  metadata?: Record<string, unknown>,
): PolicyResult;

export function deny(error: PolicyErrorCode): PolicyResult;

export function deny(
  reasonOrError: string | PolicyErrorCode,
  metadata?: Record<string, unknown>,
): PolicyResult {
  if (typeof reasonOrError === 'string') {
    return {
      allowed: false,
      reason: reasonOrError,
      metadata,
    };
  } else {
    return {
      allowed: false,
      reason: reasonOrError.message,
      metadata: {
        code: reasonOrError.code,
        remediation: reasonOrError.remediation,
        ...reasonOrError.metadata,
      },
    };
  }
}

/** Crea un evaluador de políticas (opcionalmente, con otro tamaño de caché). */
export function createPoliciesEvaluator<
  TContext extends PolicyContext = PolicyContext,
>(options?: { maxCacheSize?: number }) {
  return new PoliciesEvaluator<TContext>(options);
}

/** Convierte una política del registro en una función de política simple. */
export async function createPolicyFromRegistry<
  TContext extends PolicyContext = PolicyContext,
>(registry: PolicyRegistry, policyId: string, config?: unknown) {
  const definition = await registry.getPolicy<TContext>(policyId);

  return async (context: Readonly<TContext>, stage?: PolicyStage) => {
    const evaluator = definition.create(context as TContext, config);

    return evaluator.evaluate(stage);
  };
}

/**
 * Convierte varias políticas del registro en funciones; cada elemento es un
 * identificador o una pareja `[identificador, configuración]`.
 */
export async function createPoliciesFromRegistry<
  TContext extends PolicyContext = PolicyContext,
>(registry: PolicyRegistry, policySpecs: Array<string | [string, unknown]>) {
  const policies: PolicyFunction<TContext>[] = [];

  for (const spec of policySpecs) {
    if (typeof spec === 'string') {
      policies.push(await createPolicyFromRegistry(registry, spec));
    } else {
      const [policyId, config] = spec;
      policies.push(await createPolicyFromRegistry(registry, policyId, config));
    }
  }

  return policies;
}
