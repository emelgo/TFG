import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

import { serverLeakGuard } from './vite/server-leak-guard.ts';

import { createRequire } from 'node:module';

const requireFromHere = createRequire(import.meta.url);

// tslib's UMD build (tslib.js) self-marks `__esModule`, which breaks rolldown's
// CJS interop in the prod SSR build: the generated `__toESM(tslib).default`
// resolves to undefined, throwing "Cannot destructure property '__extends'" in
// renderToReadableStream. Force every tslib import to the pure-ESM build (a
// superset of v1's helpers) so named helpers link directly.
const tslibEsm = requireFromHere.resolve('tslib/tslib.es6.mjs');

// @base-ui/utils imports the CJS shims `use-sync-external-store/shim` and
// `.../shim/with-selector`. In the prod SSR (rolldown) build their internal
// `require('react')` becomes a runtime `createRequire('react')` -> a SECOND
// React instance with a null hook dispatcher -> "Invalid hook call" inside Base
// UI floating components (NavigationMenu). Redirect both shims to an ESM module
// that imports React via ESM, linking to the single bundled instance.
// See base-ui issue #4882 and ./vite/use-sync-external-store-shim.mjs.
const usesShim = requireFromHere.resolve(
  './vite/use-sync-external-store-shim.mjs',
);

const config = defineConfig(({ command }) => ({
  // Public, client-exposed vars use the VITE_ prefix (read via import.meta.env).
  // Server-only secrets stay unprefixed in process.env.
  envPrefix: ['VITE_'],
  // Puerto fijo 3100 (no el 3000 habitual) para no chocar con otros servicios
  // locales; coincide con VITE_SITE_URL, Supabase Auth y Playwright.
  server: { port: 3100, strictPort: true },
  resolve: {
    tsconfigPaths: true,
    alias: [
      { find: /^tslib$/, replacement: tslibEsm },
      {
        find: /^use-sync-external-store\/shim\/with-selector(\.js)?$/,
        replacement: usesShim,
      },
      {
        find: /^use-sync-external-store\/shim(\/index(\.js)?)?$/,
        replacement: usesShim,
      },
    ],
  },
  build: {
    rolldownOptions: {
      // pino-pretty is only loaded when a pretty transport is configured, which
      // we never do; keep it external so it isn't pulled into the bundle.
      external: ['pino-pretty'],
    },
  },
  ssr: {
    // Bundle workspace packages (they ship TS/TSX).
    //
    // pino + thread-stream are bundled ONLY for the production build: pino is
    // only a transitive dep of @pymekit/shared, so under pnpm it isn't resolvable
    // from the output's node_modules at runtime -> getLogger() throws
    // ERR_MODULE_NOT_FOUND. pino's core eagerly requires thread-stream, so it
    // must be bundled too. We use no transport, so bundling never spawns a
    // worker and is safe.
    //
    // In dev they must stay EXTERNAL: pino is CJS and uses top-level `require`,
    // which Vite's dev module runner can't provide when inlining the source
    // (ReferenceError: require is not defined). In dev pnpm's symlinked
    // node_modules make it resolvable, so native Node require handles it.
    //
    // @supabase/* is bundled ONLY for the production build. Left external,
    // packages like auth-js/functions-js keep a bare
    // `import { __awaiter } from 'tslib'` in the `.output/server/_libs/*`
    // chunks Nitro traces them into. At runtime Node resolves that via tslib's
    // exports map (`import.node` -> ./modules/index.js), but the build only
    // traces/copies tslib.es6.mjs into the output -> ERR_MODULE_NOT_FOUND.
    // Marking only the leaf packages noExternal isn't enough: their external
    // parents (@supabase/supabase-js, @supabase/ssr) still get traced into
    // _libs with the whole subtree. Bundling the entire scope routes every
    // tslib import through the resolve alias above (-> tslib.es6.mjs), so no
    // bare runtime import survives. In dev they stay external and resolve
    // tslib via pnpm's node_modules.
    noExternal: [
      /^@pymekit\//,
      ...(command === 'build' ? ['pino', 'thread-stream', /^@supabase\//] : []),
    ],
    external: ['pino-pretty'],
  },
  plugins: [
    serverLeakGuard(),
    devtools(),
    nitro(),
    tailwindcss(),
    tanstackStart({
      importProtection: {
        // Always error, even in dev
        behavior: 'error',
      },
    }),
    viteReact(),
  ],
}));

export default config;
