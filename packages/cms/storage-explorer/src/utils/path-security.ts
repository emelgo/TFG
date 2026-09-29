/**
 * Security utilities for file path validation and sanitization
 */

/**
 * Validates that a file name is safe and doesn't contain malicious patterns
 * @param fileName - The file name to validate
 * @throws Error if the file name is invalid
 */
export function validateFileName(fileName: string): void {
  if (!fileName || typeof fileName !== 'string') {
    throw new Error('File name is required and must be a string');
  }

  // Check length limits
  if (fileName.length === 0 || fileName.length > 255) {
    throw new Error('File name must be between 1 and 255 characters');
  }

  // Check for path traversal patterns
  if (
    fileName.includes('..') ||
    fileName.includes('/') ||
    fileName.includes('\\')
  ) {
    throw new Error('File name contains invalid path characters');
  }

  // Check for null bytes and control characters
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(fileName)) {
    throw new Error('File name contains invalid control characters');
  }

  // Check for reserved names (Windows)
  const reservedNames = [
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9',
  ];
  const nameWithoutExtension = fileName.split('.')[0]?.toUpperCase();
  if (nameWithoutExtension && reservedNames.includes(nameWithoutExtension)) {
    throw new Error('File name uses a reserved system name');
  }

  // Check for ending with dots or spaces (Windows issues)
  if (fileName.endsWith('.') || fileName.endsWith(' ')) {
    throw new Error('File name cannot end with a dot or space');
  }
}

/**
 * Validates that a file path is safe and normalized
 * @param filePath - The file path to validate
 * @throws Error if the file path is invalid
 */
export function validateFilePath(filePath: string): void {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('File path is required and must be a string');
  }

  // Check length limits
  if (filePath.length > 1024) {
    throw new Error('File path is too long (max 1024 characters)');
  }

  // Check for path traversal patterns
  if (filePath.includes('..')) {
    throw new Error('File path contains invalid traversal patterns');
  }

  // Check for absolute paths
  if (filePath.startsWith('/') || /^[a-zA-Z]:/.test(filePath)) {
    throw new Error('File path cannot be absolute');
  }

  // Check for null bytes and control characters
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(filePath)) {
    throw new Error('File path contains invalid control characters');
  }

  // Validate each segment of the path
  const segments = filePath.split('/').filter(Boolean);
  for (const segment of segments) {
    validateFileName(segment);
  }
}

/**
 * Sanitizes a filename for safe download usage
 * @param fileName - The original filename
 * @returns Sanitized filename safe for download
 */
export function sanitizeDownloadFilename(fileName: string): string {
  if (!fileName || typeof fileName !== 'string') {
    return 'download';
  }

  // Remove or replace dangerous characters
  let sanitized = fileName
    .replace(/[<>:"/\\|?*]/g, '_') // Replace Windows forbidden chars
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '_') // Replace control characters
    .replace(/\.+/g, '.') // Collapse multiple dots
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .substring(0, 200); // Limit length

  // Ensure it doesn't start with a dot
  if (sanitized.startsWith('.')) {
    sanitized = 'file_' + sanitized;
  }

  // Ensure it doesn't end with a dot or space
  sanitized = sanitized.replace(/[.\s]+$/, '');

  // If empty after sanitization, provide default
  if (!sanitized) {
    return 'download';
  }

  return sanitized;
}

/**
 * Normalizes a file path by removing redundant segments
 * @param filePath - The file path to normalize
 * @returns Normalized file path
 */
export function normalizeFilePath(filePath: string): string {
  if (!filePath) {
    return '';
  }

  // Split into segments and filter out empty ones
  const segments = filePath.split('/').filter(Boolean);

  // Remove any remaining .. or . segments
  const normalized = segments.filter(
    (segment) => segment !== '.' && segment !== '..',
  );

  return normalized.join('/');
}

/**
 * Validates file paths in batch operations
 * @param filePaths - Array of file paths to validate
 * @param maxCount - Maximum number of files allowed in batch
 * @throws Error if validation fails
 */
export function validateBatchFilePaths(
  filePaths: string[],
  maxCount: number = 100,
): void {
  if (!Array.isArray(filePaths)) {
    throw new Error('File paths must be an array');
  }

  if (filePaths.length === 0) {
    throw new Error('At least one file path is required');
  }

  if (filePaths.length > maxCount) {
    throw new Error(`Too many files in batch operation (max: ${maxCount})`);
  }

  // Validate each path
  for (const filePath of filePaths) {
    validateFilePath(filePath);
  }

  // Check for duplicates
  const uniquePaths = new Set(filePaths);
  if (uniquePaths.size !== filePaths.length) {
    throw new Error('Duplicate file paths detected in batch operation');
  }
}
