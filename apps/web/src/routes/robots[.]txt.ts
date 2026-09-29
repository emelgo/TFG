import { createFileRoute } from '@tanstack/react-router';

import appConfig from '#/config/app.config.ts';

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () => {
        const body = [
          'User-agent: *',
          'Allow: /',
          '',
          `Sitemap: ${appConfig.url}/sitemap.xml`,
          '',
        ].join('\n');

        return new Response(body, {
          headers: { 'content-type': 'text/plain' },
        });
      },
    },
  },
});
