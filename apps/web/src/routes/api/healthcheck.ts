import { createFileRoute } from '@tanstack/react-router';

import { getSupabaseServerAdminClient } from '@pymekit/supabase/server-admin-client';

/**
 * Healthcheck endpoint. A 200 means the web app is healthy; a probe (e.g.
 * Docker) can use this to decide whether to restart the container. The database
 * is considered healthy when the `config` table is readable.
 */
export const Route = createFileRoute('/api/healthcheck')({
  server: {
    handlers: {
      GET: async () => {
        const isDbHealthy = await getSupabaseHealthCheck();

        return Response.json({
          services: {
            database: isDbHealthy,
          },
        });
      },
    },
  },
});

async function getSupabaseHealthCheck() {
  try {
    const client = getSupabaseServerAdminClient();

    const { data, error } = await client
      .from('config')
      .select('billing_provider')
      .single();

    return !error && Boolean(data?.billing_provider);
  } catch {
    return false;
  }
}
