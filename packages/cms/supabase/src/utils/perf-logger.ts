import { getLogger } from '@pymekit/shared/logger';

import process from 'node:process';

/**
 * Simple performance logger for API-level timing measurements
 * Controlled by PERF_LOG_LEVEL environment variable
 * Uses Pino logger for structured logging
 */
class PerfLogger {
  private enabled: boolean;
  private logger: Awaited<ReturnType<typeof getLogger>> | null = null;

  constructor() {
    this.enabled = process.env['PERF_LOG_LEVEL'] === 'on';
    if (this.enabled) {
      this.initLogger();
    }
  }

  private async initLogger() {
    try {
      this.logger = await getLogger();
    } catch (error) {
      console.error('Failed to initialize performance logger:', error);
      this.enabled = false;
    }
  }

  /**
   * Start timing an operation
   * @param operation - Name of the operation being timed
   * @param metadata - Additional context about the operation
   * @returns Timer object with end() method
   */
  time(operation: string, metadata?: Record<string, unknown>) {
    if (!this.enabled || !this.logger) {
      return { end: () => {} };
    }

    const start = performance.now();
    this.logger.info(
      {
        event: 'perf_start',
        operation,
        ...metadata,
      },
      `[PERF_START] ${operation}`,
    );

    return {
      end: (result?: Record<string, unknown>) => {
        if (!this.logger) return;

        const duration = performance.now() - start;
        this.logger.info(
          {
            event: 'perf_end',
            operation,
            duration_ms: parseFloat(duration.toFixed(2)),
            ...metadata,
            ...result,
          },
          `[PERF_END] ${operation} - ${duration.toFixed(2)}ms`,
        );
      },
    };
  }

  /**
   * Measure an async operation
   * @param operation - Name of the operation
   * @param fn - Async function to measure
   * @param metadata - Additional context
   * @returns Result of the function
   */
  async measure<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>,
  ): Promise<T> {
    const timer = this.time(operation, metadata);
    try {
      const result = await fn();
      timer.end({ success: true });
      return result;
    } catch (error) {
      timer.end({ error: true });
      throw error;
    }
  }
}

export const perfLogger = new PerfLogger();
