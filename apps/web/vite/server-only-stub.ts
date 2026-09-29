// Vite alias target for the `server-only` package (migration decision D12).
//
// The npm `server-only` package throws unless resolved under React Server
// Components' `react-server` export condition — which does not exist in the
// TanStack Start (Vite/Nitro) SSR runtime, so importing it directly would throw
// even on the server. This stub replaces it: `import.meta.env.SSR` is statically
// replaced by Vite per environment, so the guard is tree-shaken away on the
// server (SSR = true) and always throws in a client bundle (SSR = false),
// preserving the client-leak safety net instead of a silent no-op.
if (!import.meta.env.SSR) {
  throw new Error(
    "'server-only' cannot be imported from a client bundle. Move this server " +
      'code into a route loader or a createServerFn handler.',
  );
}

export {};
