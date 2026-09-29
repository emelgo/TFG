import type { Register } from '@tanstack/react-router';
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server';
import type { RequestHandler } from '@tanstack/react-start/server';

import {
  onRequestError,
  registerMonitoringInstrumentation,
} from '@pymekit/monitoring/instrumentation';

// Load the configured monitoring provider once at server startup.
// No-op when no provider is configured.
void registerMonitoringInstrumentation();

const fetch = createStartHandler(defaultStreamHandler);

// Providing `RequestHandler` from `@tanstack/react-start/server` is required so that the output types don't import it from `@tanstack/start-server-core`
export type ServerEntry = { fetch: RequestHandler<Register> };

export function createServerEntry(entry: ServerEntry): ServerEntry {
  return {
    async fetch(...args) {
      try {
        return await entry.fetch(...args);
      } catch (error) {
        // Forward unhandled request errors, then rethrow so the framework
        // still produces its own error response. Route-level errors caught by
        // the router's errorComponent do not reach here.
        await onRequestError(error, args[0]);

        throw error;
      }
    },
  };
}

export default createServerEntry({ fetch });
