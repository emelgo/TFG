/**
 * @name escapeHtml
 * @description Escape HTML metacharacters in a string so untrusted values can
 * be safely interpolated into a raw HTML string (e.g. before being passed to a
 * translator whose output is rendered via `dangerouslySetInnerHTML`). Returns
 * an empty string for nullish input. Benign text (no metacharacters) is
 * returned unchanged.
 * @param value
 */
export function escapeHtml(value: string | undefined | null): string {
  if (value == null) {
    return '';
  }

  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
