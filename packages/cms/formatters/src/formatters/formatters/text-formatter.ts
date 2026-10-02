import type { TextFormatterConfig } from '../types';

/**
 * Text formatter for various text transformations
 * Handles truncation, case changes, email/URL formatting, etc.
 */
export class TextFormatter {
  /**
   * Format a text value according to the configuration
   */
  format(value: unknown, config?: TextFormatterConfig): string {
    // Handle null/undefined
    if (value == null) {
      return '—';
    }

    // Convert to string
    const textValue = String(value);

    // Handle empty strings
    if (textValue === '') {
      return '—';
    }

    // Get default config
    const formatterConfig: TextFormatterConfig = {
      type: 'text',
      ...config,
    };

    // Apply formatting based on type
    switch (formatterConfig.type) {
      case 'email':
        return this.formatEmail(textValue, formatterConfig);

      case 'url':
        return this.formatUrl(textValue, formatterConfig);

      case 'phone':
        return this.formatPhone(textValue);

      case 'truncate':
        return this.formatTruncate(textValue, formatterConfig);

      case 'capitalize':
        return this.formatCapitalize(textValue);

      case 'uppercase':
        return textValue.toUpperCase();

      case 'lowercase':
        return textValue.toLowerCase();

      case 'text':
      default:
        return this.formatText(textValue, formatterConfig);
    }
  }

  /**
   * Format basic text with optional whitespace handling
   */
  private formatText(text: string, config: TextFormatterConfig): string {
    let result = text;

    // Handle whitespace preservation
    if (!config.preserveWhitespace) {
      result = result.trim().replace(/\s+/g, ' ');
    }

    // Apply truncation if specified
    if (config.maxLength) {
      result = this.truncateText(
        result,
        config.maxLength,
        config.truncatePosition,
      );
    }

    return result;
  }

  /**
   * Format email addresses
   */
  private formatEmail(email: string, config: TextFormatterConfig): string {
    const trimmed = email.trim().toLowerCase();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return email; // Return original if not valid email format
    }

    // Apply truncation if needed
    if (config.maxLength && trimmed.length > config.maxLength) {
      return this.truncateText(
        trimmed,
        config.maxLength,
        config.truncatePosition,
      );
    }

    return trimmed;
  }

  /**
   * Format URLs
   */
  private formatUrl(url: string, config: TextFormatterConfig): string {
    let trimmed = url.trim();

    // Add protocol if missing
    if (!trimmed.match(/^https?:\/\//)) {
      trimmed = `https://${trimmed}`;
    }

    // Validate URL format
    try {
      new URL(trimmed);
    } catch {
      return url; // Return original if not valid URL
    }

    // Apply truncation if needed
    if (config.maxLength && trimmed.length > config.maxLength) {
      return this.truncateText(
        trimmed,
        config.maxLength,
        config.truncatePosition,
      );
    }

    return trimmed;
  }

  /**
   * Format phone numbers (basic formatting)
   */
  private formatPhone(phone: string): string {
    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, '');

    // Format based on length
    if (cleaned.length === 10) {
      // US format: (123) 456-7890
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }

    if (cleaned.length === 11 && cleaned[0] === '1') {
      // US with country code: +1 (123) 456-7890
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }

    // Return original if we can't format it
    return phone;
  }

  /**
   * Format with truncation
   */
  private formatTruncate(text: string, config: TextFormatterConfig): string {
    const maxLength = config.maxLength || 50;
    return this.truncateText(text, maxLength, config.truncatePosition);
  }

  /**
   * Capitalize first letter of each word
   */
  private formatCapitalize(text: string): string {
    return text.replace(/\b\w/g, (char) => char.toUpperCase());
  }

  /**
   * Truncate text at specified position
   */
  private truncateText(
    text: string,
    maxLength: number,
    position: 'start' | 'middle' | 'end' = 'end',
  ): string {
    if (text.length <= maxLength) {
      return text;
    }

    const ellipsis = '…';

    switch (position) {
      case 'start':
        return ellipsis + text.slice(-(maxLength - ellipsis.length));

      case 'middle': {
        const startLength = Math.ceil((maxLength - ellipsis.length) / 2);
        const endLength = Math.floor((maxLength - ellipsis.length) / 2);

        return text.slice(0, startLength) + ellipsis + text.slice(-endLength);
      }

      case 'end':
      default:
        return text.slice(0, maxLength - ellipsis.length) + ellipsis;
    }
  }

  /**
   * Utility methods for specific text operations
   */

  /**
   * Extract domain from email
   */
  extractEmailDomain(email: string): string {
    const atIndex = email.lastIndexOf('@');
    if (atIndex === -1) return '';
    return email.slice(atIndex + 1);
  }

  /**
   * Extract hostname from URL
   */
  extractUrlHostname(url: string): string {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname;
    } catch {
      return '';
    }
  }

  /**
   * Check if text appears to be an email
   */
  isEmail(text: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(text.trim());
  }

  /**
   * Check if text appears to be a URL
   */
  isUrl(text: string): boolean {
    try {
      new URL(text.startsWith('http') ? text : `https://${text}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if text appears to be a phone number
   */
  isPhone(text: string): boolean {
    const cleaned = text.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  }

  /**
   * Smart format - automatically detect and format text type
   */
  smartFormat(text: string, maxLength?: number): string {
    if (this.isEmail(text)) {
      return this.format(text, { type: 'email', maxLength });
    }

    if (this.isUrl(text)) {
      return this.format(text, { type: 'url', maxLength });
    }

    if (this.isPhone(text)) {
      return this.format(text, { type: 'phone' });
    }

    return this.format(text, { type: 'text', maxLength });
  }
}
