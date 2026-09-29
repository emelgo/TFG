---
name: bug-hunt-lite
description: Caza de bugs adversarial y ligera, limitada al diff (diff-scoped bug hunt). Úsala como Pista B de /reviewer en cada funcionalidad terminada, o por separado para una pasada rápida de seguridad y lógica (security, logic, bugs) sobre los cambios sin confirmar. No es una auditoría de todo el repositorio.
---

# Bug-Hunt Lite

Una caza de bugs adversarial, rápida y **limitada al diff**, pensada para ejecutarse en cada funcionalidad terminada. Es la versión ligera de una auditoría completa: conserva su principio central a una fracción del coste.

**El principio que hay que conservar: redundancia adversarial.** Un hallazgo solo es fiable cuando un agente *distinto* —que nunca vio el razonamiento del cazador— no consigue refutarlo. El contexto que produjo un hallazgo nunca puede confirmarlo.

Todo lo demás se recorta para ganar velocidad:

- **Alcance = el diff, no el repositorio.** Solo los ficheros modificados y su radio de impacto inmediato.
- **Sin artefactos en disco.** Los hallazgos viajan en los mensajes; no se escribe nada.
- **Pocos agentes.** De 2 a 4 cazadores y una única pasada de refutación. Sin mapa de reconocimiento, sin bucles de relleno de huecos y sin encadenar vulnerabilidades.

Si necesitas reconocimiento de todo el repositorio, auditoría de dependencias o de configuración, esta skill no es la adecuada: planifica una auditoría dedicada (y para la base de datos, `/rls-review` en modo auditoría completa).

---

## Etapa 0 — Obtener el diff (tú, en línea)

```bash
git diff HEAD
git status --short
```

Si no hay cambios sin confirmar, usa el último commit:

```bash
git show HEAD
```

Lee los ficheros modificados. Para cada fragmento anota tras qué frontera de confianza está y qué entrada nueva hace alcanzable. En PymeKit las fronteras son:

- **App web:** *server functions* (`createServerFn` en `*.functions.ts` con los *middleware* de `@pymekit/function-middleware`), `loader` de ruta, *webhooks* de pagos, consultas a Supabase (RLS) y usos del cliente administrador.
- **CMS:** rutas Hono de `apps/cms-api`, servicios Drizzle con contexto RLS, `loader`/`action` de React Router en `apps/cms`.
- **Base de datos:** políticas RLS, funciones `security definer` y RPC expuestas por PostgREST (esquema `public` y esquema del CMS).

Este es todo el «reconocimiento»: mantenlo en la cabeza, no escribas un mapa.

## Etapa 1 — Elegir las clases de ataque que expone el diff (tú, en línea)

Elige **de 3 a 5 clases que el diff expone de verdad**. No ejecutes clases que el cambio no toca. Ordénalas según la prioridad de superficie de ataque del revisor:

1. **Autenticación / permisos / aislamiento entre *tenants*** — faltan comprobaciones de propiedad o de cuenta, IDOR sobre identificadores, filtros de servidor que confían en IDs del cliente, *server functions* sin el *middleware* adecuado (`teamAccountFunctionMiddleware`, `withMinRole`, `withFeaturePermission`), rutas de administración alcanzables con una sesión normal, cliente administrador sin validación previa, huecos en RLS o en el RBAC del CMS.
2. **Pérdida o corrupción de datos / estado irreversible** — escrituras destructivas sin protección, asignación masiva hacia la BD, falta de idempotencia al crear, cobrar o finalizar.
3. ***Rollback* / reintentos / fallo parcial** — manejadores no idempotentes (sobre todo *webhooks* de Stripe), comprobar-y-actuar sobre estado compartido, *tokens* de un solo uso reutilizables con peticiones paralelas (invitaciones, restablecimientos, cupones, *nonces*).
4. **Carreras / orden / estado obsoleto** — TOCTOU, contadores o saldos sin bloqueo, reentrada.
5. **Inyección y fronteras** — SQL mediante vías de escape del ORM o SQL dinámico concatenado (Drizzle `sql.raw`, funciones CRUD del CMS), XSS vía `dangerouslySetInnerHTML`, SSRF en URLs controladas por el usuario, redirecciones abiertas, *path traversal*, código o secretos de servidor que acaban en el *bundle* del cliente (un `createServerFn` detrás de una factoría, un import de `.server.ts` desde el cliente, variables `VITE_` con secretos).
6. **Estado vacío / `null` / dependencia degradada** — rutas de `null`, *timeout*, lista vacía o dependencia caída que el camino feliz oculta.
7. **Lógica de negocio / saltarse el flujo** — omitir un paso, repetir una confirmación caducada, cantidades negativas o cero, validar un campo y actuar sobre otro.

Apóyate en los `AGENTS.md` del proyecto y en la actitud del revisor: autenticación, aislamiento entre *tenants* y estado irreversible van primero.

## Etapa 2 — Cazar (de 2 a 4 agentes en paralelo)

Agrupa las clases elegidas en **2–4 cazadores** (uno puede llevar 1–2 clases relacionadas). Lánzalos en un solo mensaje, `subagent_type=general-purpose`, todos sobre el **mismo alcance del diff**.

**Prompt del cazador (rellena las llaves):**

```
You are adversarially hunting bugs in a code change. Try to DISPROVE that it is correct.

Attack classes (only these): {classes}
Changed files / hunks to focus on:
{file:line list from the diff}

What to do:
1. Read the changed code and just enough surrounding code to trace how input reaches it from a trust boundary (server function, route loader, Hono route, webhook, RPC).
2. Trace bad inputs, retries, concurrent requests, and partially-completed operations through the changed paths.
3. Look ONLY for the listed classes. Ignore style, naming, and cleanup.
4. Stop after your 3 strongest candidates or when you've read the scope, whichever is first.

Return each candidate in your final message as a compact block (no files written):

[CANDIDATE]
class: <class>
severity: critical|high|medium|low
location: path/to/file.ts:LINES
what: 1–2 sentences — the bug and why it's a bug
trigger: how an attacker/bad input reaches this path from outside
impact: concrete — what is gained or broken (no abstract "could be exploited")
confidence: high|medium|low

Reglas:
- Cada candidato necesita un fichero:línea real. Sin ubicación, no hay candidato.
- Si tu confianza es inferior al 70 %, márcala como low, pero no lo descartes: la siguiente etapa lo juzgará.
- NO edites ningún fichero fuente. Solo lectura.
- Si no encuentras nada, responde "sin candidatos" y no inventes relleno.
```

Los prompts de los subagentes se mantienen en inglés porque son instrucciones operativas entre agentes, no documentación del proyecto.

Recoge los candidatos de los mensajes. Deduplica por **causa raíz** (si el mismo arreglo cierra ambos, es uno), no por fichero.

## Etapa 3 — Refutar (1 agente adversarial para todos)

Lanza **un único** agente `general-purpose` cuya única tarea es refutar los candidatos. No debe recibir el razonamiento de los cazadores: solo la afirmación, la ubicación y la clase.

**Prompt de refutación:**

```
Previous agents claimed these bugs exist in a code change. Your job is to DISPROVE each one. Bias toward refutation.

Candidates:
{for each: id, class, severity, location, one-line claim}

For each candidate:
1. Read the cited location and surrounding code independently.
2. Trace whether the trigger path actually exists end-to-end from an external trust boundary.
3. Check for guards the hunter may have missed: function middleware (@pymekit/function-middleware), auth/permission helpers, RLS policies or account-scope filters, Zod validators, framework escaping, upstream sanitization.

Return one verdict per candidate in your final message:

[VERDICT]
id: <id>
verdict: confirmed | refuted | needs-info
why: one concrete sentence — for refuted, name the specific guard that blocks it ("the RLS policy X already constrains this"); for confirmed, the external path that reaches it.
revised_severity: critical|high|medium|low   (only if confirmed)

Rules:
- If you cannot reach the bug from external input, refute it.
- Do not introduce new findings. Do not edit source. Read-only.
```

## Etapa 4 — Informe (tú, en línea)

Quédate solo con los `confirmed` (y los `needs-info` que consideres plausibles). Emite los hallazgos con el **listón de la Pista B** del revisor, ordenados por gravedad:

- ❌ **FAIL** `fichero:línea` — qué puede salir mal / por qué es vulnerable / impacto / arreglo concreto
- ⚠️ **WARNING** `fichero:línea` — problema + recomendación
- ✅ **PASS** — si la refutación lo descartó todo, dilo claramente con una línea de evidencia.

Para cada FAIL, da un arreglo concreto en una línea. Enumera los candidatos refutados (una línea cada uno, «refutado porque…») solo si aportan información; si no, descártalos.

Cuando se invoca dentro de `/reviewer`, devuelve estos hallazgos a su paso de síntesis en lugar de imprimir un veredicto propio; el revisor los combina con la Pista A.

---

## Reglas de funcionamiento

- **Agentes de búsqueda y de refutación separados, siempre.** Es la razón de ser de la skill; juntarlos la anula.
- **Limitada al diff.** Si te ves leyendo todo el repositorio, has elegido la herramienta equivocada.
- **Sin relleno.** Un hallazgo confirmado sólido vale más que cinco conjeturas. Un PASS honesto es un resultado válido.
- **Solo lectura.** Ningún agente edita código. Arreglar es un paso aparte que decide el autor.
- **Sin artefactos en disco.** Los hallazgos se quedan en los mensajes.

## Cuándo NO usar esta skill

- Auditoría de todo el repositorio, dependencias o configuración → planifica una auditoría dedicada.
- Aislamiento de la base de datos (RLS, *grants*, `security definer`) → `/rls-review`.
- «¿Es segura esta función concreta?» → basta con leerla.
