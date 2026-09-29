# @pymekit/function-middleware

Utilidades de autorización de servidor para `createServerFn` + `createMiddleware` de TanStack Start. Expone tuplas de *middleware* listas para usar en las *server functions* y el *middleware* y las guardas de bajo nivel con las que se componen.

Las *server functions* se definen con una llamada literal a `createServerFn(...)` y después se les añade una tupla de *middleware*. Para añadir guardas extra se expande la tupla.

```ts
import { createServerFn } from '@tanstack/react-start';
import {
  authFunctionMiddleware,
  teamAccountFunctionMiddleware,
} from '@pymekit/function-middleware/functions';
import { withMinRole } from '@pymekit/function-middleware/server';

export const updateTeamAccountFunction = createServerFn({ method: 'POST' })
  .middleware(teamAccountFunctionMiddleware)
  .validator(UpdateTeamAccountSchema) // debe incluir un `accountId` uuid
  .handler(async ({ data, context }) => {
    // context.user, context.accountId
  });

export const deleteTeamAccountFunction = createServerFn({ method: 'POST' })
  .middleware([...authFunctionMiddleware, withMinRole('owner')])
  .validator(DeleteTeamAccountSchema)
  .handler(async ({ data, context }) => { ... });
```

## Reglas obligatorias

1. `createServerFn(...)` se escribe literal en el punto de definición, nunca detrás de una fábrica. Una fábrica oculta la función al compilador de TanStack Start y envía el *handler* (con todo su grafo de Supabase y servidor) al navegador.
2. Se usan las tuplas exportadas en lugar de duplicar comprobaciones de autenticación en quien llama.
3. Las funciones autenticadas usan `authFunctionMiddleware`.
4. Las funciones acotadas a una cuenta de equipo usan `teamAccountFunctionMiddleware`, más `withMinRole` / `withFeaturePermission` para las guardas de rol o permiso. Toda guarda que lea `accountId` exige que el `.validator` de la función incluya un `accountId` uuid.
5. Las funciones de administración usan `adminFunctionMiddleware` (exige `is_superadmin`). Nunca se protege una mutación de administración solo con comprobaciones en el cliente.
6. La lógica de autorización reutilizable va en este paquete, no improvisada dentro de las funciones de cada funcionalidad.
7. Se mantiene estable la forma del contexto que expone cada *middleware*.
8. Este paquete se ocupa de componer la autorización, no de la lógica de negocio ni de los esquemas de entrada. RLS sigue aplicando el control de acceso en la capa de servicios y datos: las guardas son defensa en profundidad, no un sustituto.

## Estructura del paquete

- `@pymekit/function-middleware/functions`: tuplas precompuestas para el punto de definición: `authFunctionMiddleware`, `adminFunctionMiddleware` y `teamAccountFunctionMiddleware`.
- `@pymekit/function-middleware/server`: *middleware* y guardas de bajo nivel: `errorMiddleware`, `authMiddleware`, `adminMiddleware`, `teamAccountMiddleware`, `withMinRole(role)` y `withFeaturePermission(permission: AppPermission)`.
- `.` (raíz): reexporta solo las tuplas (`./functions`).

## Cuándo usar cada uno

- `authFunctionMiddleware`: basta con un usuario con sesión iniciada.
- `teamAccountFunctionMiddleware`: debe existir una membresía activa en la cuenta de equipo.
- `withMinRole(role)`: guarda por jerarquía de roles (el rol dado o uno superior). Combina `has_more_elevated_role` y `has_same_role_hierarchy_level`, porque `has_role_on_account` compara el rol exacto.
- `withFeaturePermission(permission)`: permiso RBAC de la cuenta mediante `has_permission`.
- `adminFunctionMiddleware`: solo super-admin (`is_superadmin`).

## Contexto estable

- `authFunctionMiddleware`: `context.user`.
- `teamAccountFunctionMiddleware`: `context.user`, `context.accountId`.
- `adminFunctionMiddleware`: `context.user`.
- `withMinRole` / `withFeaturePermission` también inyectan `context.accountId`.

## Semántica de errores

- `errorMiddleware` normaliza los errores lanzados a un `Error(message)` simple, para que nunca se serialicen al cliente objetos internos o de PostgREST. `redirect()` / `notFound()` de `@tanstack/react-router` pasan sin tocarse, así que la navegación sigue funcionando.
- No se añaden a la ligera mensajes de error de autorización propios de cada paquete.

## Llamada desde el cliente

- La función se envuelve con `useServerFn(...)` y el envoltorio se pasa a TanStack Query como `mutationFn`.
- Se llama con `mutation.mutate({ data })` (o `mutateAsync` para flujos imperativos o `toast.promise`).
- Los estados de carga, éxito y error de la UI se derivan de la mutación (`isPending`, `onSuccess`, `onError`); la lógica de negocio se queda en la *server function* o el servicio.

## Puntos de entrada

- Tuplas: `src/functions.ts` (`@pymekit/function-middleware/functions`).
- *Middleware* y guardas de bajo nivel: `src/middleware.server.ts`, expuestos a través del *barrel* `src/server.ts` (`@pymekit/function-middleware/server`). El *barrel* evita que el especificador público apunte a una ruta `*.server.*`: la protección de imports de TanStack Start rechaza los imports entre paquetes que resuelven directamente a un módulo `.server.*`, y las referencias a `createMiddleware` sobreviven en los *stubs* RPC del cliente (aunque el compilador elimina el cuerpo de sus *handlers*).
- Raíz: `src/index.ts` expone solo las tuplas.

## Verificación

- `pnpm --filter @pymekit/function-middleware typecheck`
- Si cambia el comportamiento o la forma del contexto, se comprueban los tipos de los consumidores afectados (`@pymekit/admin`, `@pymekit/accounts`, `@pymekit/team-accounts`, `@pymekit/otp`, `web`).
