import {
  adminMiddleware,
  authMiddleware,
  errorMiddleware,
  teamAccountMiddleware,
} from './middleware.server';

/**
 * Tuplas de *middleware* listas para usar en las *server functions*.
 *
 * Cada tupla antepone `errorMiddleware` (que limpia los errores antes de
 * enviarlos al cliente) a la guarda correspondiente. Se pasan a una llamada
 * literal a `createServerFn(...)` en el punto de definición: así el
 * compilador de TanStack Start reconoce la *server function* y elimina del
 * paquete del cliente su *handler* y todo el grafo de Supabase y
 * autenticación que arrastra. Si el `createServerFn` se escondiera detrás de
 * una fábrica, el compilador no lo vería y el *handler* acabaría en el
 * navegador.
 *
 * ```ts
 * export const removeMemberFunction = createServerFn({ method: 'POST' })
 *   .middleware(teamAccountFunctionMiddleware)
 *   .validator(RemoveMemberSchema)
 *   .handler(async ({ data, context }) => { ... });
 * ```
 *
 * Para añadir guardas de `@pymekit/function-middleware/server` se expande la
 * tupla:
 *
 * ```ts
 * .middleware([...authFunctionMiddleware, withFeaturePermission('members.manage')])
 * ```
 *
 * [TFG] RNF-02 Seguridad: la autorización se comprueba siempre en el servidor.
 */

/** Exige un usuario autenticado; añade `context.user`. */
export const authFunctionMiddleware = [
  errorMiddleware,
  authMiddleware,
] as const;

/** Exige un superadministrador con sesión MFA (`aal2`). */
export const adminFunctionMiddleware = [
  errorMiddleware,
  adminMiddleware,
] as const;

/**
 * Exige que el usuario sea miembro de la cuenta `accountId` de la entrada;
 * añade `context.accountId`.
 */
export const teamAccountFunctionMiddleware = [
  errorMiddleware,
  teamAccountMiddleware,
] as const;
