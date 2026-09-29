# PymeKit — Directrices para agentes y desarrolladores

> **TFG** · *Diseño e implementación de una arquitectura software reutilizable para el desarrollo ágil de aplicaciones SaaS orientadas a pymes*
> Grado en Ingeniería Informática · Escuela Superior de Ingeniería · Universidad de Cádiz
> Tutor: Juan Carlos de la Torre Macías

Este fichero es la **fuente única de directrices** del repositorio. `CLAUDE.md` lo importa y cualquier otra herramienta de IA debe leerlo.

## 0. Antes de empezar cualquier sesión

1. Lee `docs/tfg/PROGRESO.md` para saber en qué fase estamos y qué queda pendiente.
2. Si la tarea es de una fase concreta, lee su apartado en `docs/tfg/PLAN.md` (objetivo, entregables y criterio de «hecho»).
3. Si la tarea toca una decisión de arquitectura ya tomada, consulta `docs/tfg/DECISIONES.md`. No se reabren decisiones sin registrar una nueva con `/decision`.

## 1. Qué es PymeKit

PymeKit es una **plataforma base reutilizable** para construir aplicaciones SaaS dirigidas a pymes. Integra:

| Módulo | Dónde vive | Requisitos |
|---|---|---|
| Frontend + backend (*server functions*) | `apps/web` | RF-01, RF-02 |
| Autenticación y autorización | `packages/features/auth`, `packages/function-middleware`, RLS en `apps/web/supabase` | RF-03, RF-04 |
| Usuarios, equipos (multi-tenant), roles y permisos | `packages/features/{accounts,team-accounts}` | RF-05, RF-06 |
| Pagos y suscripciones (Stripe) | `packages/billing/*` | RF-07 |
| Panel de super-administración | `packages/features/admin` | RF-08 |
| CMS de datos (explorador de BD, usuarios, almacenamiento, auditoría), integrado en la consola admin | `apps/web/src/routes/admin/cms`, `apps/web/src/routes/api/cms`, `packages/cms/*` | RF-09, RF-10 |

Los requisitos completos están en `docs/tfg/REQUISITOS.md`.

## 2. Código de referencia (solo lectura)

| Ruta | Contenido | Se reutiliza para |
|---|---|---|
| `../makerkit` | Kit SaaS: TanStack Start + Supabase + Stripe | `apps/web`, `apps/e2e` y la mayoría de `packages/*` |
| `../supamode` | CMS para Supabase: SPA + API Hono | `packages/cms/*`, `apps/web/src/routes/{admin,api}/cms` y el esquema `cms` de la BD |

**Reglas:**
- **Nunca** se modifica nada dentro de `../makerkit` ni de `../supamode`.
- Cuando algo ya existe en la referencia, se **reutiliza** en lugar de reescribirlo. Antes de crear código nuevo, busca primero allí.
- Todo lo que se reutiliza sigue el flujo **copiar → desmarcar → comentar en español → verificar → registrar**, descrito en `docs/tfg/GUIA-DESMARCADO.md`. La skill `/portar-modulo` lo automatiza.
- Cada módulo portado se anota en `docs/tfg/MAPA-REFERENCIAS.md`.
- **Nunca** se nombra a los proyectos de referencia en el código, la UI, los emails ni la documentación de usuario. Tampoco se nombran en la memoria del TFG. Solo aparecen en la documentación interna (`docs/tfg/`).

## 3. Idioma y comentarios

| Elemento | Idioma |
|---|---|
| Comentarios, JSDoc, `comment on` de SQL | **Español didáctico** |
| Documentación (`docs/`, README, manuales), mensajes de commit, memoria | Español |
| Identificadores (variables, funciones, tipos, tablas, columnas, claves i18n, ficheros) | Inglés |
| Interfaz de usuario | i18n: `es` por defecto y `en` como segundo idioma |

Los comentarios se escriben **para quien lee el código por primera vez** (el tribunal, el tutor o el próximo desarrollador). Deben explicar *qué hace el módulo, por qué existe y cómo encaja en la arquitectura*. La guía completa, con ejemplos para TS, TSX y SQL, está en **`docs/tfg/GUIA-COMENTARIOS.md`**. Es de cumplimiento obligatorio.

**Resumen:**
- Los ficheros con lógica llevan una cabecera: qué es, por qué existe y cómo encaja.
- Las funciones exportadas llevan JSDoc en español.
- Los comentarios en línea explican el porqué, no el qué.
- Las decisiones de seguridad (RLS, cliente admin, `security definer`, `grant`/`revoke`) siempre se justifican.
- Se usa `// [TFG] RNF-xx …` para enlazar puntos clave con los requisitos o la memoria. Cada uso se refleja en `docs/tfg/TRAZABILIDAD.md`.
- Los comentarios heredados en inglés se reescriben (no se traducen literalmente). Si eran obvios, se eliminan. Para esto está la skill `/comentar-modulo`.

## 4. Stack y estructura del monorepo (objetivo)

- **Turborepo + pnpm** (catálogo de versiones en `pnpm-workspace.yaml`), Node ≥ 20 y TypeScript estricto.
- **Supabase**: Postgres, Auth y Storage. Hay **una única base de datos** compartida por la app y el CMS.
- **Tailwind CSS 4 + Shadcn UI**.

```
apps/
  web/            App SaaS: TanStack Start (rutas por fichero + createServerFn), React 19
                  · CMS integrado: pantallas en src/routes/admin/cms, API Hono en src/routes/api/cms
  web/supabase/   Esquemas, migraciones, seed y tests pgTAP de TODA la BD (incluye el esquema `cms`)
  e2e/            Pruebas Playwright (web y CMS)
packages/
  ui, supabase, function-middleware, features/*, billing/*, i18n, shared, …   → @pymekit/*
  cms/*           Lógica del CMS: servicios Drizzle, rutas Hono, componentes    → @pymekit/cms-*
tooling/          Configuración compartida (TypeScript, scripts)
docs/tfg/         Planificación, requisitos, decisiones y guías del TFG
memoria/          Memoria del TFG en LaTeX
scripts/tfg/      Scripts de control del TFG (branding, comentarios)
```

Hasta que termine la Fase 1 solo existen `docs/`, `scripts/`, `memoria/` y el *harness*. Las directrices por paquete (`apps/*/AGENTS.md`, `packages/*/AGENTS.md`) se portan traducidas junto con su código.

### 4.1 App web (`apps/web`): patrones clave

- **Rutas** en `apps/web/src/routes`. El fichero `routeTree.gen.ts` se genera automáticamente y nunca se edita a mano.
- **Datos**: los `loader` de ruta llaman a *server functions*. Para controlar la navegación se lanzan `redirect` / `notFound` desde `@tanstack/react-router`.
- **Server functions**: `createServerFn` de `@tanstack/react-start`, definidas en ficheros `*.functions.ts` con el sufijo `Function`. Siguen la cadena `.middleware(...).validator(Schema).handler(...)` y usan los *middleware* de `@pymekit/function-middleware/functions`:
  - `authFunctionMiddleware` inyecta `context.user`.
  - `teamAccountFunctionMiddleware` comprueba que el usuario es miembro del equipo.
  - `adminFunctionMiddleware` exige super-admin.
  - Para añadir controles más finos se usan `withMinRole(role)` y `withFeaturePermission(permission)` de `@pymekit/function-middleware/server`.
- **Desde el cliente** se llaman con `useMutation({ mutationFn: useServerFn(fn) })`.
- **Clientes Supabase**:
  - `getSupabaseServerClient`: aplica RLS.
  - `useSupabase` (navegador): aplica RLS.
  - `getSupabaseServerAdminClient`: **ignora RLS**. Se usa lo mínimo posible, con validación manual y un comentario que lo justifique.
- **Formularios**: `@tanstack/react-form` con `@pymekit/ui/field` y validación con Zod (skill `react-form-builder`).
- **Cuentas**: se usan las fábricas `createAccountsApi(client)` / `createTeamAccountsApi(client)` en lugar de consultar las tablas directamente. La cuenta activa se obtiene con `useWorkspace()`.
- **Logs**: `getLogger()` de `@pymekit/shared/logger`. Nunca se usa `console.log` en código de producción.
- **Multi-tenant**: la cuenta personal cumple `auth.users.id = accounts.id`. Los equipos tienen miembros, roles y permisos. Los datos de negocio se enlazan con `account_id`.
- Los módulos que solo deben ejecutarse en el servidor usan el sufijo `.server.ts`. No se mezclan imports de cliente y de servidor.

### 4.2 CMS integrado (`/admin/cms`): patrones clave

El CMS forma parte de la web (ADR-011): no es una app aparte. Se accede desde la consola de super-admin.

- **API (servidor):** una app Hono montada en `/api/cms/*` desde una ruta de servidor de TanStack Start.
  - Cada funcionalidad sigue el flujo servicio Drizzle (clase + fábrica `createXService()`) → ruta Hono registrada en el paquete `packages/cms/<feature>` (export `/routes`).
  - Las rutas Hono y los servicios son **solo de servidor**; nunca se importan desde componentes.
  - Los servicios son ligeros: los algoritmos van en `/utils` como funciones puras.
  - Drizzle ejecuta cada transacción con los *claims* JWT del usuario, así que las políticas RLS del esquema `cms` también se aplican.
- **Interfaz (cliente):** rutas de TanStack Router en `apps/web/src/routes/admin/cms/**`.
  - Datos: `loader` + TanStack Query con el cliente RPC tipado de Hono.
  - Mutaciones: `useMutation`.
  - **No se usan** `loader`/`action`/`useFetcher` de React Router: al portar, se reescriben.
- **Misma pila que el resto de la web** (ADR-013):
  - formularios con `@tanstack/react-form` + `@pymekit/ui/field` (no react-hook-form);
  - textos con `@pymekit/i18n` (use-intl, namespace `cms`), no i18next;
  - componentes de `@pymekit/ui`, añadiendo allí los que falten.
- **Acceso (ADR-014):** el super-admin de la plataforma es la raíz del CMS. El RBAC propio del CMS (esquema `cms`: roles, grupos y permisos) da acceso limitado a otro personal. Sus políticas se revisan con `/rls-review`, igual que las de la app.

### 4.3 Base de datos (`apps/web/supabase`)

- **RLS obligatorio** en toda tabla nueva. La autorización se aplica en la base de datos, no solo en la aplicación.
- Hay que respetar el orden de los esquemas numerados. Las migraciones se generan a partir de los esquemas.
- Tras cambiar el esquema: `pnpm supabase:web:typegen`.
- Todo cambio de políticas, `grant`, funciones `security definer` o vistas exige tests pgTAP y la skill `/rls-review`.

## 5. Convenciones de código

- Código limpio, simple y explícito. Se infieren los tipos y se evitan los tipos de retorno explícitos innecesarios.
- No se usa `any` salvo que esté justificado con un comentario.
- Componentes pequeños y componibles. Se evita `useEffect` (si hace falta, se justifica). Se prefiere un único objeto de estado.
- Se añade `data-testid` en los elementos que usen las pruebas E2E.
- **i18n**: ningún texto visible va escrito directamente en el código. La clave se añade primero en `es` y después en `en`, y se usa `Trans` o los mensajes.
- La configuración reutilizable va en `*.config.ts` y en variables de entorno documentadas. Es la base de la reutilización que defiende el TFG.

## 6. Verificación obligatoria

Al terminar cualquier cambio:

1. `pnpm typecheck`
2. `pnpm lint:fix`
3. `pnpm format:fix`
4. `node scripts/tfg/check-branding.mjs`: no puede quedar ninguna referencia a los proyectos de referencia.
5. Tests afectados: `pnpm test:unit`; si se tocó la BD, `pnpm supabase:web:test`; si se tocó un flujo de usuario, E2E.
6. Skill `/reviewer` (revisión adversarial del diff).
7. **Si el cambio tocó la BD o RLS** (política, `grant`, `security definer`, vista, migración o cualquier fichero de `apps/web/supabase/`): skill `/rls-review`.
8. Subagente `revisor-comentarios` sobre los ficheros nuevos o portados.
9. Actualizar `docs/tfg/PROGRESO.md`. Si procede, actualizar también `DECISIONES.md`, `TRAZABILIDAD.md` y `MAPA-REFERENCIAS.md`.

Mientras no exista el código de la app (Fase 0), solo se aplican los pasos 4 y 9.

## 7. Git

- La rama principal es `main`. Se trabaja en ramas `fase-N/tema` (por ejemplo, `fase-2/cms-migraciones`).
- Los commits van en español y siguen Conventional Commits, con el ámbito del módulo. Por ejemplo: `feat(billing): planes de suscripción para pymes`, `docs(tfg): ADR-004 esquema del CMS`.
- Nunca se suben secretos (`.env.local`, claves de Stripe o Supabase).
- Solo se hace commit o push cuando lo pide el autor.

## 8. Skills y subagentes disponibles

| Skill / agente | Para qué |
|---|---|
| `/portar-modulo <ruta>` | Traer un módulo desde la referencia siguiendo el flujo completo |
| `/comentar-modulo <ruta>` | Reescribir los comentarios de un módulo en español didáctico |
| `/decision` | Registrar una decisión de diseño (ADR) en `docs/tfg/DECISIONES.md` |
| `/seccion-memoria <tema>` | Redactar un borrador LaTeX de una sección de la memoria |
| `/reviewer`, `/bug-hunt-lite` | Revisión adversarial y de seguridad del diff |
| `/rls-review`, `postgres-expert` | Base de datos, RLS y pgTAP |
| `service-builder`, `react-form-builder`, `playwright-e2e` | Patrones de implementación (web y CMS) |
| Agente `revisor-calidad` | Revisión de calidad con las normas de PymeKit |
| Agente `revisor-comentarios` | Auditoría de comentarios (idioma, tono didáctico, desmarcado) |
| Agente `redactor-memoria` | Redacción académica de la memoria |
