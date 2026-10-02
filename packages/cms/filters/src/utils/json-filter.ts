/**
 * Validación de formato de los filtros de columnas JSON.
 *
 * Devuelve la clave i18n del error (relativa a `cms.dataExplorer`) o `null`
 * si el valor es válido. Es una ayuda inmediata para el usuario: el servidor
 * vuelve a validar el valor antes de usarlo.
 */
import type { FilterOperator } from '../types';

export function validateJsonFilterValue(
  operator: FilterOperator,
  value: string,
): string | null {
  if (!value.trim()) {
    return 'filters.jsonErrors.emptyValue';
  }

  switch (operator) {
    case 'hasKey':
      return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value.trim())
        ? null
        : 'filters.jsonErrors.invalidKey';

    case 'keyEquals': {
      if (!value.includes(':')) {
        return 'filters.jsonErrors.missingColon';
      }

      const [key, ...rest] = value.split(':');

      return key?.trim() && rest.join(':').trim()
        ? null
        : 'filters.jsonErrors.invalidKeyValue';
    }

    case 'pathExists':
      return value === '$' || value.startsWith('$.')
        ? null
        : 'filters.jsonErrors.invalidPath';

    default:
      return null;
  }
}
