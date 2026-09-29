import * as z from 'zod';

/**
 * @name MONITORING_PROVIDERS
 * @description The list of monitoring providers. No third-party provider ships
 * by default; register your own (see custom-monitoring-provider docs).
 */
const MONITORING_PROVIDERS = [
  '',
  // Add more providers here
] as const;

export const MONITORING_PROVIDER = z
  .enum(MONITORING_PROVIDERS)
  .optional()
  .transform((value) => value || undefined);

export type MonitoringProvider = z.output<typeof MONITORING_PROVIDER>;

/**
 * @name getMonitoringProvider
 * @description Get the monitoring provider based on the VITE_MONITORING_PROVIDER environment variable.
 * @returns The monitoring provider or undefined if no provider is specified
 */
export function getMonitoringProvider() {
  // `VITE_` vars are inlined on `import.meta.env` (client + server bundle);
  // fall back to `process.env` for plain Node (e.g. scripts, tests).
  const provider = MONITORING_PROVIDER.safeParse(
    import.meta.env.VITE_MONITORING_PROVIDER ??
      process.env.VITE_MONITORING_PROVIDER,
  );

  if (!provider.success) {
    console.error(
      `Error: Invalid monitoring provider\n\n${provider.error.message}.\n\nWill fallback to console service.\nPlease review the variable VITE_MONITORING_PROVIDER`,
    );

    return;
  }

  return provider.data;
}
