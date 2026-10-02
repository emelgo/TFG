/**
 * Etiquetas legibles para los valores de los enumerados (F3b).
 *
 * En la base de datos los enumerados se guardan en `snake_case` («in_app»,
 * «past_due», «roles.manage»…), que es cómodo para el código pero no para
 * las personas. Este módulo decide QUÉ TEXTO SE MUESTRA para un valor, sin
 * cambiar nunca el valor en sí: los filtros, los parámetros de la URL y lo
 * que se guarda siguen usando el valor original.
 *
 * Orden de resolución (de más a menos específico):
 *
 * 1. Etiqueta configurada en la columna (`ui_config.value_labels` del CMS),
 *    que el administrador edita en Ajustes → Recursos.
 * 2. Traducción explícita `common.enums.<enumerado>.<valor>` de los
 *    mensajes de `es`/`en`, para los enumerados propios de PymeKit.
 * 3. «Humanizador» por defecto: `in_app` → «In app».
 *
 * La parte pura (`humanizeEnumValue`, `enumMessageKey`, `resolveEnumLabel`)
 * no depende de React y se prueba con tests unitarios; el gancho
 * `useEnumLabel` solo la conecta con `use-intl`.
 */
import { useCallback } from 'react';

import { useTranslations } from 'use-intl';

/** Etiquetas configuradas a mano: valor del enumerado → texto visible. */
export type EnumValueLabels = Record<string, string | null | undefined>;

/**
 * Convierte un valor técnico en una frase legible: separa por `_`, `-` y
 * `.`, pasa a minúsculas y pone en mayúscula solo la primera letra
 * («PAST_DUE» → «Past due», «roles.manage» → «Roles manage»). Si el valor no
 * tiene letras («*») se devuelve tal cual.
 */
export function humanizeEnumValue(value: string): string {
  const words = value
    .split(/[_\-.\s]+/)
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!words) return value;

  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Heurística para cuando no se conoce el tipo de la columna (p. ej. las
 * etiquetas de un gráfico de un panel): un identificador en minúsculas con
 * `_` («past_due», «in_app») casi seguro es un valor técnico. Las palabras
 * sueltas, fechas o textos con espacios se dejan tal cual.
 */
export function looksLikeEnumValue(value: string): boolean {
  return /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(value);
}

/**
 * Clave segura para `use-intl`: los puntos anidan claves, así que
 * «roles.manage» se guarda como «roles_manage»; el comodín «*» como «all».
 */
export function enumMessageKey(value: string): string {
  if (value === '*') return 'all';

  return value.replace(/[^A-Za-z0-9_]/g, '_');
}

export interface ResolveEnumLabelOptions {
  /** Nombre del tipo enumerado de PostgreSQL (sin esquema), si se conoce. */
  enumName?: string | null;
  /** Etiquetas configuradas en la columna (prioridad máxima). */
  overrides?: EnumValueLabels | null;
  /**
   * Busca una traducción por clave relativa a `common.enums`
   * (`<enumerado>.<valor>`); devuelve `undefined` si no existe.
   */
  translate?: (key: string) => string | undefined;
}

/** Aplica el orden «columna → traducción → humanizador» a un valor. */
export function resolveEnumLabel(
  value: unknown,
  options: ResolveEnumLabelOptions = {},
): string {
  if (value === null || value === undefined) return '';

  const raw = String(value);
  const override = options.overrides?.[raw]?.trim();

  if (override) return override;

  if (options.enumName && options.translate) {
    const translated = options.translate(
      `${enumMessageKey(options.enumName)}.${enumMessageKey(raw)}`,
    );

    if (translated) return translated;
  }

  return humanizeEnumValue(raw);
}

/**
 * Gancho de React: devuelve una función `(valor, opciones) => etiqueta` que
 * usa los mensajes del idioma activo.
 */
export function useEnumLabel() {
  const t = useTranslations('common.enums');

  return useCallback(
    (
      value: unknown,
      options: Omit<ResolveEnumLabelOptions, 'translate'> = {},
    ) =>
      resolveEnumLabel(value, {
        ...options,
        // `t.has` evita que use-intl devuelva la clave en crudo cuando no
        // hay traducción; en ese caso se pasa al humanizador.
        translate: (key) => (t.has(key as never) ? t(key as never) : undefined),
      }),
    [t],
  );
}

/**
 * Componente de conveniencia para pintar la etiqueta de un valor dentro de
 * JSX sin declarar el gancho en el componente padre (tablas, insignias…).
 */
export function EnumLabel(props: {
  value: unknown;
  enumName?: string | null;
  overrides?: EnumValueLabels | null;
}) {
  const label = useEnumLabel()(props.value, {
    enumName: props.enumName,
    overrides: props.overrides,
  });

  // Un componente puede devolver texto directamente (sin JSX).
  return label;
}
