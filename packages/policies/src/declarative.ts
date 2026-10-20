/**
 * API declarativa para definir políticas.
 *
 * `definePolicy` crea una definición con identificador, fases en las que se
 * aplica y un esquema opcional de configuración. Al evaluarla, el contexto
 * se clona y se congela, de modo que una política no puede modificar los
 * datos que verán las siguientes, y cualquier excepción se convierte en un
 * rechazo (la política falla en cerrado).
 */
import type { z } from 'zod';

import type { PolicyContext, PolicyResult, PolicyStage } from './types';

/** Error estructurado de una política que rechaza una acción. */
export interface PolicyErrorCode {
  /** Código para la máquina (por ejemplo, para elegir el mensaje i18n). */
  code: string;
  /** Mensaje legible. */
  message: string;
  /** Indicaciones opcionales para resolverlo. */
  remediation?: string;
  /** Metadatos adicionales. */
  metadata?: Record<string, unknown>;
}

/** Motivo de rechazo con la política y la fase que lo produjeron. */
export interface PolicyReason extends PolicyErrorCode {
  /** Identificador de la política. */
  policyId: string;
  /** Fase en la que se produjo. */
  stage?: PolicyStage;
}

/** Evaluador de una política ya ligado a un contexto inmutable. */
export interface PolicyEvaluator<TContext extends PolicyContext> {
  /** Evalúa la política en la fase indicada. */
  evaluate(stage?: PolicyStage): Promise<PolicyResult>;

  /** Devuelve el contexto (congelado). */
  getContext(): Readonly<TContext>;
}

/** Definición de una política tal y como se guarda en el registro. */
export interface FeaturePolicyDefinition<
  TContext extends PolicyContext = PolicyContext,
  TConfig = unknown,
> {
  /** Identificador único. */
  id: string;

  /** Fases en las que se aplica (si se omite, en todas). */
  stages?: PolicyStage[];

  /** Esquema opcional para validar la configuración. */
  configSchema?: z.ZodType<TConfig>;

  /** Crea un evaluador para un contexto y una configuración concretos. */
  create(context: TContext, config?: TConfig): PolicyEvaluator<TContext>;
}

/** Crea un resultado que permite la acción. */
export function allow(metadata?: Record<string, unknown>): PolicyResult {
  return {
    allowed: true,
    metadata,
  };
}

/** Crea un resultado que rechaza la acción con un error estructurado. */
export function deny(error: PolicyErrorCode): PolicyResult {
  return {
    allowed: false,
    reason: error.message,
    metadata: {
      code: error.code,
      remediation: error.remediation,
      ...error.metadata,
    },
  };
}

/** Congela un objeto y, recursivamente, todas sus propiedades. */
function deepFreeze<T>(obj: T, visited = new WeakSet()): Readonly<T> {
  // Se recuerdan los objetos visitados para no entrar en un bucle infinito
  // con referencias circulares.
  if (visited.has(obj as object)) {
    return obj;
  }

  visited.add(obj as object);

  const propNames = Reflect.ownKeys(obj as object);

  // Primero las propiedades y después el propio objeto.
  for (const name of propNames) {
    const value = (obj as Record<string, unknown>)[name as string];

    if ((value && typeof value === 'object') || typeof value === 'function') {
      deepFreeze(value, visited);
    }
  }

  return Object.freeze(obj);
}

/**
 * Clona un objeto aunque contenga funciones u otros valores que
 * `structuredClone` no admite.
 */
function safeClone<T>(obj: T): T {
  try {
    return structuredClone(obj);
  } catch {
    // structuredClone falla si hay funciones (por ejemplo, un cliente de
    // Supabase en el contexto): se hace una copia superficial clonando cada
    // propiedad que se pueda.
    if (obj && typeof obj === 'object') {
      const cloned = Array.isArray(obj) ? ([] as unknown as T) : ({} as T);

      for (const [key, value] of Object.entries(obj)) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (cloned as any)[key] = structuredClone(value);
        } catch {
          // Lo que no se puede clonar (como las funciones) se copia por
          // referencia.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (cloned as any)[key] = value;
        }
      }

      return cloned;
    }

    // Primitivos y objetos no clonables se devuelven tal cual.
    return obj;
  }
}

/**
 * Devuelve una copia congelada del contexto, para que ninguna política pueda
 * alterar lo que evalúan las demás ni el objeto original de quien llama.
 */
function createImmutableContext<T extends PolicyContext>(
  context: T,
): Readonly<T> {
  const cloned = safeClone(context);

  return deepFreeze(cloned);
}

/**
 * Define una política con su identificador, fases, esquema de configuración
 * y función de evaluación.
 *
 * @throws Al crear el evaluador, si la configuración no cumple `configSchema`.
 */
export function definePolicy<
  TContext extends PolicyContext = PolicyContext,
  TConfig = unknown,
>(config: {
  /** Identificador único. */
  id: string;

  /** Fases en las que se aplica (si se omite, en todas). */
  stages?: PolicyStage[];

  /** Esquema opcional para validar la configuración. */
  configSchema?: z.ZodType<TConfig>;

  /** Implementación de la regla. */
  evaluate: (
    context: Readonly<TContext>,
    config?: TConfig,
    stage?: PolicyStage,
  ) => Promise<PolicyResult>;
}) {
  return {
    id: config.id,
    stages: config.stages,
    configSchema: config.configSchema,

    create(context: TContext, policyConfig?: TConfig) {
      if (config.configSchema && policyConfig !== undefined) {
        const validation = config.configSchema.safeParse(policyConfig);

        if (!validation.success) {
          throw new Error(
            `Invalid configuration for policy "${config.id}": ${validation.error.message}`,
          );
        }
      }

      const immutableContext = createImmutableContext(context);

      return {
        async evaluate(stage?: PolicyStage) {
          // Fuera de sus fases la política no opina: se da por superada y se
          // marca como omitida.
          if (stage && config.stages && !config.stages.includes(stage)) {
            return allow({
              skipped: true,
              reason: `Policy not applicable for stage: ${stage}`,
            });
          }

          try {
            const result = await config.evaluate(
              immutableContext,
              policyConfig,
              stage,
            );

            // Se añaden la política y la fase a los metadatos para poder
            // rastrear qué regla decidió.
            return {
              ...result,
              metadata: {
                policyId: config.id,
                stage,
                ...result.metadata,
              },
            };
          } catch (error) {
            // Un error al evaluar se trata como rechazo: ante la duda, la
            // acción no se permite.
            return deny({
              code: 'POLICY_EVALUATION_ERROR',
              message:
                error instanceof Error
                  ? error.message
                  : 'Policy evaluation failed',
              metadata: {
                policyId: config.id,
                stage,
                error: error instanceof Error ? error.message : 'Unknown error',
              },
            });
          }
        },

        getContext() {
          return immutableContext;
        },
      };
    },
  };
}
