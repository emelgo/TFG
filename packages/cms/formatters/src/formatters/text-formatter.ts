/**
 * Text formatting utilities for human-readable display
 */

/**
 * Convert a data type to a human readable format
 * @param dataType - The data type to convert (can be any type)
 * @returns The human readable format
 */
export function toHumanReadable(dataType: unknown): string {
  if (dataType === null || dataType === undefined || dataType === '') {
    return '';
  }

  // Ensure we're working with a string
  const typeString = String(dataType);

  return typeString
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
