/**
 * Parses a displayFormat string to extract column names referenced within curly braces
 * Examples:
 * - "{name}" -> ["name"]
 * - "{name} - {email}" -> ["name", "email"]
 * - "User: {first_name} {last_name}" -> ["first_name", "last_name"]
 * - "No format" -> []
 * - null/undefined -> []
 */
export function parseDisplayFormatColumns(
  displayFormat?: string | null,
): string[] {
  if (!displayFormat || typeof displayFormat !== 'string') {
    return [];
  }

  // Match all text within curly braces: {column_name}
  const matches = displayFormat.match(/\{([^}]+)\}/g);

  if (!matches) {
    return [];
  }

  // Extract column names and deduplicate
  const columns = matches
    .map((match) => match.slice(1, -1).trim()) // Remove { } and trim whitespace
    .filter((column) => column.length > 0) // Remove empty strings
    .filter((column) => isValidColumnName(column)); // Only keep valid column names

  // Return unique columns only
  return [...new Set(columns)];
}

/**
 * Validates that a column name contains only safe characters
 * Allows: letters, numbers, underscores, dots (for qualified names)
 */
function isValidColumnName(column: string): boolean {
  // Allow alphanumeric, underscore, and dot for schema.table.column references
  const validPattern = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
  return validPattern.test(column);
}

/**
 * Builds the optimal column list for a batch query based on displayFormat
 * Always includes the primary key column and any unique constraints for record identification and URL building
 */
export function buildOptimalColumnList(
  displayFormat?: string | null,
  primaryKeyColumn: string = 'id',
  uniqueConstraintColumns: string[] = [],
): string[] {
  const formatColumns = parseDisplayFormatColumns(displayFormat);

  // Always include the primary key for record identification
  const columns = new Set([primaryKeyColumn]);

  // Add unique constraint columns for URL building (fallback when no PK)
  uniqueConstraintColumns.forEach((col) => columns.add(col));

  // Add columns from displayFormat
  formatColumns.forEach((col) => columns.add(col));

  return Array.from(columns);
}

/**
 * Estimates the performance improvement from using selective columns
 * Returns the reduction factor (e.g., 0.3 means 70% reduction in data)
 */
export function estimateColumnReduction(
  selectedColumns: string[],
  totalColumns: number,
): number {
  if (totalColumns <= 0 || selectedColumns.length >= totalColumns) {
    return 0; // No reduction
  }

  return 1 - selectedColumns.length / totalColumns;
}
