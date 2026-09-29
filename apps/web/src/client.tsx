import { StrictMode, startTransition } from 'react';

import { StartClient } from '@tanstack/react-start/client';
import { hydrateRoot } from 'react-dom/client';

import { registerClientMonitoringInstrumentation } from '@pymekit/monitoring/instrumentation-client';

// Install global error/unhandledrejection handlers before hydration so client
// errors (including uncaught server-fn / TanStack DB promise rejections) reach
// the configured monitoring provider. No-op when no provider is configured.
registerClientMonitoringInstrumentation();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});
