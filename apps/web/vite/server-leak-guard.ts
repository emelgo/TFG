import type { Plugin } from 'vite';

/**
 * Fails the client build if a server-only module is emitted into the browser
 * bundle.
 *
 * Client components must never statically import the database layer or the
 * server functions/services that reach it — those belong in route loaders or
 * `createServerFn` handlers (which the compiler strips from the client). When
 * one slips in, the whole server graph (Drizzle, the postgres driver) ships to
 * the browser and crashes at runtime (`Buffer is not defined`).
 *
 * The check runs against the FINAL emitted chunks (post tree-shaking), so a
 * module that is imported but shaken out — e.g. a `createServerFn` handler's
 * dependencies — is correctly ignored. Only modules that actually survive into
 * a client chunk are reported.
 */
const SERVER_ONLY = [
  /\/node_modules\/(\.pnpm\/)?postgres[@/]/,
  /\/node_modules\/(\.pnpm\/)?drizzle-orm[@/]/,
  // Convention: any first-party module named `*.server.ts`/`*.server.tsx` is
  // server-only and must never survive into a client chunk. Import it only from
  // a route loader or `createServerFn` handler (which the compiler strips).
  /\/(packages|apps)\/.*\.server\.(ts|tsx)($|\?)/,
];

// `createMiddleware(...).server(...)` handlers are stripped by the TanStack Start
// compiler exactly like `createServerFn`, so the middleware definitions are
// legitimately referenced from client-side action stubs (as no-op stubs, with no
// server logic). Allowlist them so the generic `.server.` rule doesn't false-flag
// a module that carries no leaked server code.
const ALLOWED = [/\/packages\/function-middleware\/src\/middleware\.server\./];

function shortId(id: string) {
  return id
    .replace(/.*\/node_modules\/(\.pnpm\/)?/, '')
    .replace(/.*\/packages\//, 'packages/')
    .replace(/.*\/apps\//, 'apps/');
}

export function serverLeakGuard(): Plugin {
  return {
    name: 'server-leak-guard',
    apply: 'build',
    generateBundle(_options, bundle) {
      if (this.environment?.name !== 'client') return;

      const offenders: string[] = [];

      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk') continue;

        const leaked = file.moduleIds.filter(
          (id) =>
            SERVER_ONLY.some((re) => re.test(id)) &&
            !ALLOWED.some((re) => re.test(id)),
        );

        if (leaked.length === 0) continue;

        const entry = file.facadeModuleId
          ? shortId(file.facadeModuleId)
          : file.fileName;

        for (const id of leaked) {
          offenders.push(`  ${shortId(id)}\n    in chunk ${entry}`);
        }
      }

      if (offenders.length === 0) return;

      this.error(
        `Server-only modules leaked into the client bundle:\n\n${offenders.join(
          '\n\n',
        )}\n\nMove the server work into a route loader or createServerFn and pass data as props.`,
      );
    },
  };
}
