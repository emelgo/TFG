// Public entrypoint for the lower-level middleware and gates.
//
// This is a thin barrel over `middleware.server.ts` so the cross-package
// specifier `@pymekit/function-middleware/server` resolves to a NON-`.server.ts`
// file. TanStack Start's import-protection denies any cross-package import that
// resolves directly to a `**/*.server.*` module in the client graph — and the
// `createMiddleware(...)` references survive into the client RPC stubs of
// consuming `*.functions.ts` files. The compiler still strips the `.server(...)`
// handler bodies (and their Supabase graph) from those stubs, so re-exporting
// through this barrel is safe. Mirrors how the original root `index.ts` barrel
// exposed the same middleware.
export * from './middleware.server';
