import { createFileRoute } from '@tanstack/react-router';

// Stamped once at server start: 'dev' in development, otherwise the build/boot
// timestamp. Exposed as plain text for uptime/version probes.
const BUILD_TIME = import.meta.env.DEV ? 'dev' : new Date().toISOString();

export const Route = createFileRoute('/api/version')({
  server: {
    handlers: {
      GET: () => {
        return new Response(BUILD_TIME, {
          headers: { 'content-type': 'text/plain' },
        });
      },
    },
  },
});
