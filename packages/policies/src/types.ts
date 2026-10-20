/**
 * Tipos base del motor de políticas de negocio.
 *
 * Una *política* es una regla de negocio que decide si una acción está
 * permitida (por ejemplo, "un plan gratuito no puede invitar a más de tres
 * miembros"). Complementa a la RLS: la base de datos garantiza quién puede
 * tocar qué fila, y las políticas expresan reglas configurables por cada
 * aplicación que reutilice PymeKit sin tocar el código de las
 * funcionalidades.
 */

/**
 * Contexto mínimo que reciben todas las políticas; cada funcionalidad lo
 * amplía con sus propios datos (usuario, cuenta, invitaciones...).
 */
export interface PolicyContext {
  /** Momento en que empezó la evaluación. */
  timestamp: string;

  /** Metadatos adicionales para depuración y registro. */
  metadata?: Record<string, unknown>;
}

/**
 * Resultado común de toda evaluación de política, para que todas las
 * funcionalidades traten las decisiones igual.
 */
export interface PolicyResult {
  /** Si la política permite la acción. */
  allowed: boolean;

  /** Motivo legible cuando la acción no está permitida. */
  reason?: string;

  /** Si el rechazo requiere revisión manual. */
  requiresManualReview?: boolean;

  /** Metadatos para depuración, registro o personalizar la interfaz. */
  metadata?: Record<string, unknown>;
}

/**
 * Fase de evaluación: un texto libre que permite ejecutar distintas
 * políticas en distintos momentos del flujo.
 *
 * Ejemplos habituales:
 * - 'preliminary': antes de que el usuario envíe el formulario (para avisar
 *   pronto en la interfaz);
 * - 'submission': al enviar, con los datos reales;
 * - 'post_action': después de completar la acción.
 *
 * Cada aplicación puede definir las suyas ('validation', 'audit'...).
 */
export type PolicyStage = string;
