/**
 * Display formatter for template-based string formatting.
 * Replaces placeholders in a template string with values from a record.
 */

export type RecordDisplayFormatter = (
  displayFormat: string,
  record: Record<string, unknown>,
) => string | null | undefined;

/**
 * Creates a record display formatter function
 * @returns A record display formatter function
 */
export function createRecordDisplayFormatter(): RecordDisplayFormatter {
  return (displayFormat: string, record: Record<string, unknown>): string => {
    // Replace all {fieldName} or {fieldName || otherField} placeholders with the corresponding values
    return displayFormat.replace(/{([^}]+)}/g, (_, expression: string) => {
      // Split by the OR operator and trim each field name
      const fieldNames = expression.split('||').map((field) => field.trim());

      // Find the first non-empty value
      for (const fieldName of fieldNames) {
        const value = record[fieldName];

        // If value exists and is not null/undefined, return it
        if (value !== null && value !== undefined && value !== '') {
          return String(value);
        }
      }

      // If all values are empty, return an empty string
      return '';
    });
  };
}

/**
 * Default record display formatter instance
 */
export const formatRecord = createRecordDisplayFormatter();
