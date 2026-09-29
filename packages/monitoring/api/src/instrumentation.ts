import { createRegistry } from '@pymekit/shared/registry';

import {
  type MonitoringProvider,
  getMonitoringProvider,
} from './get-monitoring-provider';

type InstrumentationRegistration = {
  register: () => Promise<void> | void;
  // Required: client dedup assumes server request errors are captured here.
  onRequestError: (error: unknown, request?: Request) => Promise<void> | void;
};

const instrumentationRegistry = createRegistry<
  InstrumentationRegistration,
  NonNullable<MonitoringProvider>
>();

// Register your monitoring instrumentation here.

/**
 * @name registerMonitoringInstrumentation
 * @description Register monitoring instrumentation based on the
 * VITE_MONITORING_PROVIDER environment variable.
 */
export async function registerMonitoringInstrumentation() {
  const provider = getMonitoringProvider();

  if (!provider) return;

  const instrumentation = await instrumentationRegistry.get(provider);

  return instrumentation.register();
}

/**
 * @name onRequestError
 * @description Forward request-lifecycle errors to the configured monitoring
 * provider. Providers should implement this to record errors with the proper
 * request context (route, method, headers, etc.).
 */
export const onRequestError = async (error: unknown, request?: Request) => {
  const provider = getMonitoringProvider();

  if (!provider) {
    return;
  }

  const instrumentation = await instrumentationRegistry.get(provider);

  return instrumentation.onRequestError(error, request);
};
