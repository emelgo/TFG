---
name: service-builder
description: Construye services puros e independientes de la interfaz, con dependencias inyectadas, para las dos variantes de PymeKit — web (cliente Supabase llamado desde server functions `createServerFn`) y cms-api (Drizzle llamado desde rutas Hono). Úsala al crear lógica de negocio que deba reutilizarse entre server functions, rutas, tests o herramientas. Invócala con /service-builder.
---

# Constructor de servicios

Eres experto en construir servicios puros y testeables, desacoplados de quien los llama.

## Principio rector

**Todo servicio está desacoplado de su interfaz (E/S).** Recibe datos planos, hace su trabajo y devuelve datos planos. No sabe si lo llama una *server function*, una ruta Hono, un *loader*, un script o un test. Quien lo llama es un **adaptador fino** que resuelve las dependencias y delega.

En PymeKit hay **dos variantes**. Decide primero en cuál estás; no mezcles sus patrones.

| | **Web** (`apps/web`, `packages/features/*`, `packages/*`) | **CMS API** (`apps/cms-api`, `packages/cms/*`) |
|---|---|---|
| Acceso a datos | Cliente Supabase (`SupabaseClient<Database>`) | Drizzle (`DrizzleSupabaseClient` → `runTransaction`) |
| Adaptador | *Server function* (`createServerFn`) en `*.functions.ts` | Ruta Hono (`registerXRouter(router)`) |
| Validación | `.validator(Schema)` con Zod | `zValidator('json', Schema)` de `@hono/zod-validator` |
| Autenticación | *Middleware* de `@pymekit/function-middleware/functions` | *Middleware* global de `/v1/*` en `apps/cms-api` (inyecta `supabase` y `drizzle` en el contexto) |
| Autorización | RLS + `withMinRole` / `withFeaturePermission` | RLS (vía `runTransaction`) + `createAuthorizationService(c).hasAdminPermission(...)` |
| Consumidor en UI | `useServerFn` + `useMutation`, o el `loader` de la ruta | Cliente RPC `createHonoClient<Route>()` desde una *action*/*loader* de React Router |

Ejemplos completos de ambas variantes en [examples.md](examples.md). Código de referencia (solo lectura): `../makerkit/packages/features/team-accounts/src/server/` y `../supamode/packages/features/settings/src/api/`.

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
- **CMS API**: recibe el cliente Drizzle (o, como en el código de referencia, el `Context` de Hono del que lo obtiene con `c.get('drizzle')`). Para servicios nuevos, prefiere inyectar solo el cliente: así se puede probar sin montar Hono.

Se exporta una **fábrica** `createXService(...)`, no la clase.

### Paso 3: escribir adaptadores finos

El adaptador resuelve dependencias, llama al servicio y se ocupa de lo propio de la interfaz:

- **Web** (*server function*): autenticación con *middleware*, validación con `.validator`, logs con `getLogger()`, devolver un resultado serializable (`{ success: true }` o `{ success: false, error: 'clave.i18n' }`). La recarga de datos (`router.invalidate()`) y la navegación se hacen **en el cliente**, en el `onSuccess` de `useMutation`.
- **CMS API** (ruta Hono): validación con `zValidator`, logs, `c.json(...)` y el código HTTP adecuado. Se registra en `apps/cms-api` (fichero de rutas) y **nunca** se importa desde la SPA.

### Paso 4: escribir tests

Como el servicio recibe sus dependencias, se prueba con *stubs* en Vitest: sin base de datos y sin *runtime* del *framework*.

## Reglas

1. **Los servicios son funciones puras sobre datos.** Objetos y primitivos de entrada y de salida. Nada de `Request`/`Response`, `Context` en la firma pública, `FormData` ni `redirect()`.
2. **Las dependencias se inyectan, no se importan.** Cliente Supabase, cliente Drizzle, *storage*, otros servicios: todo llega por el constructor.
3. **Los adaptadores son pegamento trivial.** Sin reglas de negocio en la *server function* ni en la ruta Hono.
4. **Un servicio, muchos consumidores.** Si dos interfaces hacen lo mismo, llaman al mismo método. Duplicar la lógica es un error.
5. **Testeable de forma aislada.** Si hace falta una base de datos para probar el servicio, refactoriza.
6. **La seguridad se decide en el adaptador y en la BD, y se comenta.** Usa el cliente con RLS por defecto. El cliente administrador (`getSupabaseServerAdminClient` en web, `getDrizzleSupabaseAdminClient` en el CMS) **ignora RLS**: solo se usa con una comprobación previa y un comentario que lo justifique (ver `docs/tfg/GUIA-COMENTARIOS.md`).
7. **Los servicios del CMS son ligeros.** Los algoritmos van a `src/utils/` como funciones puras; el servicio solo orquesta la E/S.
8. **Comentarios en español didáctico**: cabecera de fichero y JSDoc en cada método público.

## Qué va en cada sitio

| Responsabilidad | Web | CMS API |
|---|---|---|
| Esquema Zod | `src/schema/*.schema.ts` | `src/api/schemas.ts` o `src/schemas/` |
| Lógica de negocio | `src/server/services/*.service.server.ts` | `src/api/services/*.service.ts` |
| Adaptador | `src/server/functions/*.functions.ts` | `src/api/routes/*-route.ts` |
| Autenticación | `.middleware(authFunctionMiddleware)` | *Middleware* global de `/v1/*` |
| Permisos finos | `withMinRole` / `withFeaturePermission` | `createAuthorizationService(c).hasAdminPermission(...)` |
| Logs | `getLogger()` en el adaptador | `getLogger()` en el adaptador |
| Recargar datos | Cliente: `router.invalidate()` | *Action* de React Router: `invalidateKeys` |
| Algoritmos puros | `src/lib/` o `src/utils/` | `src/utils/` (+ `__tests__/`) |

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

# CMS: packages/cms/<feature>/
src/
├── api/                                       # SOLO SERVIDOR
│   ├── routes/feature-route.ts                # registerFeatureRouter(router)
│   └── services/feature.service.ts
├── actions/feature-action.ts                  # cliente RPC (createHonoClient)
├── schemas/index.ts                           # compartido
├── utils/                                     # funciones puras + __tests__/
└── components/                                # SOLO CLIENTE
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

// ❌ MAL (CMS): importar rutas o servicios del API desde la SPA
import { registerFeatureRouter } from '@pymekit/cms-feature/routes'; // en apps/cms
```
