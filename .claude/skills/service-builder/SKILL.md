---
name: service-builder
description: Construye services puros e independientes de la interfaz, con dependencias inyectadas, para las dos variantes de PymeKit — web (cliente Supabase llamado desde server functions `createServerFn`) y API del CMS (Drizzle llamado desde rutas Hono en `packages/cms/<feature>`, montadas en `/api/cms` y consumidas con el cliente RPC tipado de `@pymekit/cms-ui-core`). Úsala al crear lógica de negocio que deba reutilizarse entre server functions, rutas, tests o herramientas. Invócala con /service-builder.
---

# Constructor de servicios

Eres experto en construir servicios puros y testeables, desacoplados de quien los llama.

## Principio rector

**Todo servicio está desacoplado de su interfaz (E/S).** Recibe datos planos, hace su trabajo y devuelve datos planos. No sabe si lo llama una *server function*, una ruta Hono, un *loader*, un script o un test. Quien lo llama es un **adaptador fino** que resuelve las dependencias y delega.

En PymeKit hay **dos variantes**. Decide primero en cuál estás; no mezcles sus patrones.

| | **Web** (`apps/web`, `packages/features/*`, `packages/*`) | **API del CMS** (`packages/cms/<feature>`, solo servidor) |
|---|---|---|
| Acceso a datos | Cliente Supabase (`SupabaseClient<Database>`) | Drizzle (`c.get('drizzle').runTransaction(...)`, tipo `DrizzleSupabaseClient` de `@pymekit/cms-supabase/client`) |
| Adaptador | *Server function* (`createServerFn`) en `*.functions.ts` | Ruta Hono (`registerXRoute(router)`) exportada desde `./routes` |
| Validación | `.validator(Schema)` con Zod | `zValidator('json', Schema.strict(), hookConCódigo)` de `@hono/zod-validator` |
| Autenticación | *Middleware* de `@pymekit/function-middleware/functions` | `registerAuthMiddleware` (`@pymekit/cms-auth/routes`): sesión de la web, `cms_access`, no bloqueado; deja `supabase`, `drizzle` y `authorization` en el contexto |
| Autorización | RLS + `withMinRole` / `withFeaturePermission` | RLS + `cms.verify_admin_access()` (vía `runTransaction`) y, para responder 403 claro, `createAuthorizationService(c).hasAdminPermission(recurso, acción)` |
| Errores | `{ success: false, error: 'clave.i18n' }` | `{ success: false, error, errorCode }` con un código de `@pymekit/cms-shared/error-codes`; nunca el texto de PostgreSQL |
| Consumidor en UI | `useServerFn` + `useMutation`, o el `loader` de la ruta | Función en `@pymekit/cms-ui-core` sobre `createHonoClient<XRoute>` (solo `import type` de la ruta) + `useMutation`/`queryOptions` |

Ejemplos completos de ambas variantes en [examples.md](examples.md). Guía autoritativa del CMS: `packages/cms/AGENTS.md`. Ejemplo real: `packages/cms/settings/src/api/` (`services/account.service.ts`, `routes/update-preferences-route.ts`).

## Flujo de trabajo

### Paso 1: definir el contrato

Empieza por los tipos de entrada y salida: TypeScript plano y Zod, sin tipos del *framework*. El esquema se reutiliza en el formulario (cliente) y en el adaptador (servidor), por eso vive en un fichero propio.

```typescript
// src/schema/project.schema.ts
import * as z from 'zod';

// Los mensajes son claves i18n: el componente `FieldError` las traduce.
export const CreateProjectSchema = z.object({
  name: z.string().min(1, 'projects.errors.nameRequired').max(100),
  accountId: z.uuid(),
});

export type CreateProjectInput = z.output<typeof CreateProjectSchema>;
```

### Paso 2: construir el servicio

El servicio recibe **todas** sus dependencias. Nunca importa ni crea el cliente de base de datos por su cuenta.

- **Web**: recibe el `SupabaseClient<Database>` en el constructor. Nunca llama a `getSupabaseServerClient()` dentro.
- **API del CMS**: el patrón existente es una clase con fábrica `createXService(c)` que lee `c.get('drizzle')` del `Context`. Para servicios nuevos, prefiere inyectar solo el `DrizzleSupabaseClient` (más fácil de probar sin montar Hono). Los algoritmos van a `lib/` o `utils/` como funciones puras con tests.

Se exporta una **fábrica** `createXService(...)`, no la clase.

### Paso 3: escribir adaptadores finos

El adaptador resuelve dependencias, llama al servicio y se ocupa de lo propio de la interfaz:

- **Web** (*server function*): autenticación con *middleware*, validación con `.validator`, logs con `getLogger()`, devolver un resultado serializable (`{ success: true }` o `{ success: false, error: 'clave.i18n' }`). La recarga de datos (`router.invalidate()`) y la navegación se hacen **en el cliente**, en el `onSuccess` de `useMutation`.
- **API del CMS** (ruta Hono): `zValidator` con esquema `.strict()` y *hook* que responde 400 con código estable, comprobación de permiso, logs con `getLogger()` de `@pymekit/shared/logger`, `c.json({ success, data })` o `c.json({ success: false, error, errorCode }, status)`. Exporta `export type XRoute = ReturnType<typeof registerXRoute>`, regístrala en `registerFeatureRoutes()` de `packages/cms/api/src/server.ts` y **nunca** la importes desde código de cliente.

### Paso 4: escribir tests

Como el servicio recibe sus dependencias, se prueba con *stubs* en Vitest: sin base de datos y sin *runtime* del *framework*.

## Reglas

1. **Los servicios son funciones puras sobre datos.** Objetos y primitivos de entrada y de salida. Nada de `Request`/`Response`, `Context` en la firma pública, `FormData` ni `redirect()`.
2. **Las dependencias se inyectan, no se importan.** Cliente Supabase, cliente Drizzle, *storage*, otros servicios: todo llega por el constructor.
3. **Los adaptadores son pegamento trivial.** Sin reglas de negocio en la *server function* ni en la ruta Hono.
4. **Un servicio, muchos consumidores.** Si dos interfaces hacen lo mismo, llaman al mismo método. Duplicar la lógica es un error.
5. **Testeable de forma aislada.** Si hace falta una base de datos para probar el servicio, refactoriza.
6. **La seguridad se decide en el adaptador y en la BD, y se comenta.** Usa el cliente con RLS por defecto. El cliente administrador (`getSupabaseServerAdminClient` en web; `getDrizzleSupabaseAdminClient` o `getSupabaseAdminClient` en el CMS) **ignora RLS**: solo se usa con una comprobación previa y un comentario que lo justifique (ver `docs/tfg/GUIA-COMENTARIOS.md`).
7. **Los servicios del CMS son ligeros.** Los algoritmos van a `src/api/utils/` o `src/lib/` como funciones puras con tests; el servicio solo orquesta la E/S.
8. **Comentarios en español didáctico**: cabecera de fichero y JSDoc en cada método público.
9. **Errores del CMS con código estable.** Lanza un error con código (p. ej. `SettingsError(CMS_API_ERROR_CODES.X, msg)`) o clasifica el SQLSTATE en la ruta; el cliente traduce el `errorCode` a una clave i18n. Añade los códigos nuevos a `@pymekit/cms-shared/error-codes`.

## Qué va en cada sitio

| Responsabilidad | Web | API del CMS |
|---|---|---|
| Esquema Zod | `src/schema/*.schema.ts` | En la ruta o `src/api/schemas.ts` (estricto); el de formulario, en `packages/cms/<feature>-ui/src/utils/` |
| Lógica de negocio | `src/server/services/*.service.server.ts` | `packages/cms/<feature>/src/api/services/*.service.ts` |
| Adaptador | `src/server/functions/*.functions.ts` | `packages/cms/<feature>/src/api/routes/*-route.ts` |
| Autenticación | `.middleware(authFunctionMiddleware)` | `registerAuthMiddleware` (global) |
| Permisos finos | `withMinRole` / `withFeaturePermission` | `createAuthorizationService(c).hasAdminPermission(...)` + RLS |
| Logs | `getLogger()` en el adaptador | `getLogger()` en el adaptador |
| Cliente | `useServerFn` + `router.invalidate()` | `packages/cms/ui-core/src/<feature>-api.ts` + `cmsQueryKeys`/`invalidateQueries` |
| Algoritmos puros | `src/lib/` o `src/utils/` | `src/api/utils/` (+ `__tests__/`) |

## Estructura de ficheros

```
# Web: packages/features/<feature>/
src/
├── schema/feature.schema.ts
├── server/
│   ├── services/
│   │   ├── feature.service.server.ts
│   │   └── __tests__/feature.service.test.ts
│   └── functions/feature.functions.ts        # createServerFn (sufijo `Function`)
└── components/feature-form.tsx

# CMS, servidor: packages/cms/<feature>/       (@pymekit/cms-<feature>, export ./routes)
src/api/
├── routes/feature-route.ts + index.ts         # registerFeatureRoute(router) + tipo
├── services/feature.service.ts
└── utils/                                     # funciones puras + __tests__/

# CMS, cliente: packages/cms/ui-core/src/<feature>-api.ts   (createHonoClient<FeatureRoute>)
#               packages/cms/<feature>-ui/                  (componentes, hooks, utils)
```

## Antipatrones

```typescript
// ❌ MAL: el servicio crea su propio cliente (acoplado al framework)
class ProjectService {
  async create(data: CreateProjectInput) {
    const client = getSupabaseServerClient();
    // …
  }
}

// ❌ MAL: reglas de negocio dentro de la server function
export const createProjectFunction = createServerFn({ method: 'POST' })
  .middleware(authFunctionMiddleware)
  .validator(CreateProjectSchema)
  .handler(async ({ data }) => {
    const client = getSupabaseServerClient();

    if (data.name.startsWith('tmp-')) throw new Error('…'); // no reutilizable
    return client.from('projects').insert(data);
  });

// ❌ MAL: `redirect()` lanzado desde una server function llamada con
// useMutation: el redirect rechaza la mutación y aparece como error.
// Devuelve `{ success: true, redirectTo }` y navega en el cliente.

// ❌ MAL (CMS): importar valores de rutas o servicios desde código de cliente
// (arrastra Drizzle y la clave secreta; `serverLeakGuard` rompe la build)
import { registerFeatureRoute } from '@pymekit/cms-feature/routes';
// ✅ BIEN: solo el tipo, para el cliente RPC
import type { FeatureRoute } from '@pymekit/cms-feature/routes';

// ❌ MAL (CMS): devolver el mensaje de PostgreSQL al cliente
return c.json({ error: error.message }, 500);
```
