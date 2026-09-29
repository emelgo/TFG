import { createFileRoute } from '@tanstack/react-router';

import { getDatabaseWebhookHandlerService } from '@pymekit/database-webhooks';
import { getServerMonitoringService } from '@pymekit/monitoring/server';

/**
 * Supabase database webhook receiver.
 *
 * Supabase signs each webhook with `X-Supabase-Event-Signature`; the handler
 * service verifies it against the raw request body, so the untouched payload
 * text is passed straight through. Failures are captured by the monitoring
 * service and answered with a 500 so Supabase retries.
 */
export const Route = createFileRoute('/api/db/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const service = getDatabaseWebhookHandlerService();

        try {
          const signature = request.headers.get('X-Supabase-Event-Signature');

          if (!signature) {
            return new Response('Missing signature', { status: 400 });
          }

          const payload = await request.text();

          await service.handleWebhook({ payload, signature });

          return new Response(null, { status: 200 });
        } catch (error) {
          const monitoring = await getServerMonitoringService();

          await monitoring.ready();
          await monitoring.captureException(error as Error);

          return new Response(null, { status: 500 });
        }
      },
    },
  },
});
