import {
  adminMiddleware,
  authMiddleware,
  errorMiddleware,
  teamAccountMiddleware,
} from './middleware.server';

/**
 * Pre-composed middleware tuples for use with a literal `createServerFn(...)`
 * call at the function definition site. This lets TanStack Start's compiler
 * detect the server function and strip its handler — and the Supabase/auth
 * graph it pulls — from the client bundle. A factory that returns a
 * `createServerFn` builder hides it from the compiler, shipping the handler to
 * the browser.
 *
 * ```ts
 * export const removeMemberFunction = createServerFn({ method: 'POST' })
 *   .middleware(teamAccountFunctionMiddleware)
 *   .validator(RemoveMemberSchema)
 *   .handler(async ({ data, context }) => { ... });
 * ```
 *
 * Layer extra gates from `@pymekit/function-middleware/server` by spreading a tuple:
 *
 * ```ts
 * .middleware([...authFunctionMiddleware, withFeaturePermission('members.manage')])
 * ```
 */
export const authFunctionMiddleware = [
  errorMiddleware,
  authMiddleware,
] as const;

export const adminFunctionMiddleware = [
  errorMiddleware,
  adminMiddleware,
] as const;

export const teamAccountFunctionMiddleware = [
  errorMiddleware,
  teamAccountMiddleware,
] as const;
