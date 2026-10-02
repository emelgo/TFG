/**
 * Configuración y validación del campo de texto de un filtro.
 *
 * Según el tipo de la columna (y su `ui_data_type`, p. ej. `email` o `url`)
 * el campo usa un `type` de HTML distinto, un texto de ejemplo y una
 * validación de formato. Los operadores de coincidencia parcial («contiene»,
 * «empieza por», «acaba en») no se validan: buscar `@empresa` en un correo es
 * legítimo aunque no sea un correo completo.
 */
import type { FilterItem } from '../types';

export type FilterInputKind =
  | 'number'
  | 'url'
  | 'email'
  | 'color'
  | 'uuid'
  | 'text';

export type FilterInputConfig = {
  kind: FilterInputKind;
  /** Atributo `type` del `<input>`. */
  type: 'number' | 'url' | 'email' | 'color' | 'text';
  /** Ejemplo de valor válido que se muestra en el mensaje de error. */
  hint: string;
};

const NUMERIC_TYPES = [
  'number',
  'integer',
  'bigint',
  'smallint',
  'numeric',
  'real',
  'double precision',
];

const PARTIAL_MATCH_OPERATORS = ['contains', 'startsWith', 'endsWith'];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;

/** Devuelve la configuración del campo de texto para la columna del filtro. */
export function getFilterInputConfig(filter: FilterItem): FilterInputConfig {
  const uiDataType = filter.ui_config.ui_data_type;
  const dataType = filter.ui_config.data_type;

  if (NUMERIC_TYPES.includes(dataType)) {
    return { kind: 'number', type: 'number', hint: '123' };
  }

  if (['url', 'image', 'audio', 'video'].includes(uiDataType ?? '')) {
    return { kind: 'url', type: 'url', hint: 'https://example.com' };
  }

  if (uiDataType === 'email') {
    return { kind: 'email', type: 'email', hint: 'name@example.com' };
  }

  if (uiDataType === 'color') {
    return { kind: 'color', type: 'color', hint: '#FFFFFF' };
  }

  if (dataType === 'uuid') {
    return {
      kind: 'uuid',
      type: 'text',
      hint: '123e4567-e89b-12d3-a456-426614174000',
    };
  }

  return { kind: 'text', type: 'text', hint: 'Hello World' };
}

/**
 * Comprueba que el valor escrito tiene el formato que espera la columna.
 */
export function isValidFilterInput(
  value: string,
  config: FilterInputConfig,
  operator: string | undefined,
) {
  if (operator && PARTIAL_MATCH_OPERATORS.includes(operator)) {
    return true;
  }

  switch (config.kind) {
    case 'number':
      return value.trim() !== '' && !Number.isNaN(Number(value));

    case 'url':
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }

    case 'email':
      return EMAIL_PATTERN.test(value);

    case 'color':
      return COLOR_PATTERN.test(value);

    case 'uuid':
      return UUID_PATTERN.test(value);

    default:
      return true;
  }
}
