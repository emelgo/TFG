---
name: reviewer
description: Revisión adversarial (adversarial code review) de los últimos cambios de PymeKit. Dos pistas en paralelo — calidad y arquitectura, y búsqueda de bugs con bug-hunt-lite — más las comprobaciones propias del TFG (comentarios didácticos en español, check-branding y documentación en docs/tfg). Úsala al terminar cualquier funcionalidad o cuando se pida "review", "revisar el diff", "reviewer" o "¿está listo para merge?". Invócala con /reviewer.
---

# Revisor adversarial

Vas a hacer una revisión en dos pistas de los últimos cambios. Tu trabajo es **romper la confianza en el cambio, no validarlo**, y además encontrar alternativas más simples y mejor estructuradas.

## Paso 1 — Obtener el diff

```bash
git diff HEAD
git status --short
```

Si no hay cambios sin confirmar, revisa el último commit:

```bash
git show --stat HEAD
git show HEAD
```

## Paso 2 — Actitud

Parte del escepticismo. Supón que el cambio puede fallar de formas sutiles, costosas o visibles para el usuario hasta que la evidencia demuestre lo contrario.

- No des crédito por la buena intención, los arreglos parciales ni el trabajo que «seguramente» llegará después.
- Si algo solo funciona en el camino feliz, es una debilidad real.
- Es mejor un hallazgo sólido que varios débiles: no diluyas los problemas graves con relleno.
- Si el cambio parece seguro, dilo sin rodeos.

## Paso 3 — Lanzar dos subagentes en paralelo

### Pista A — Auditoría adversarial de calidad y arquitectura

Lanza el agente `revisor-calidad` (`.claude/agents/revisor-calidad.md`). Si aún no existe, lanza un subagente `Explore` con estas instrucciones: verificar el cumplimiento de los `AGENTS.md` aplicables, señalar antipatrones y proponer alternativas más simples.

Pásale la lista de ficheros modificados. Puntos que debe vigilar en este stack:

- La lógica de servidor usa `createServerFn` de `@tanstack/react-start` en ficheros `*.functions.ts`, con la llamada literal en el punto de definición (nunca detrás de una factoría) y con las tuplas de *middleware* de `@pymekit/function-middleware/functions` (`authFunctionMiddleware`, `teamAccountFunctionMiddleware`, `adminFunctionMiddleware`) más `withMinRole` / `withFeaturePermission` de `@pymekit/function-middleware/server`.
- El cliente administrador (`getSupabaseServerAdminClient`) ignora RLS: cada uso necesita una validación manual previa y un comentario que la justifique.
- En el CMS (`packages/cms/*` (API en `/api/cms`)), las consultas pasan por el cliente Drizzle con contexto RLS, no por el cliente administrador.
- No se mezclan imports de cliente y servidor (los módulos solo de servidor llevan el sufijo `.server.ts`).

### Pista B — Revisión adversarial de lógica y bugs

Ejecuta la skill `bug-hunt-lite` sobre el diff. Lanza entre 2 y 4 cazadores en paralelo que intentan refutar el cambio y después una pasada adversarial independiente que intenta refutar sus candidatos. Así se mantiene el principio de redundancia adversarial con un coste bajo.

`bug-hunt-lite` ya cubre las prioridades de superficie de ataque y el listón de hallazgos de abajo, y devuelve los hallazgos confirmados en el formato de esta sección, que se combinan en el Paso 5. Las prioridades y los listones siguientes son el contrato que cumple; mantenlos como referencia.

Si `bug-hunt-lite` no está disponible, lanza un subagente `general-purpose` con la instrucción de refutar el cambio: buscar invariantes violados, comprobaciones ausentes, rutas de fallo sin tratar y supuestos que dejan de cumplirse bajo presión, y seguir cómo avanzan las entradas maliciosas, los reintentos, las acciones concurrentes y las operaciones a medias por el código modificado.

#### Superficie de ataque, por orden de prioridad

1. Autenticación, permisos, aislamiento entre *tenants* (incluido el RBAC del CMS en su propio esquema) y fronteras de confianza
2. Pérdida, corrupción o duplicación de datos y cambios de estado irreversibles
3. Seguridad del *rollback*, reintentos, fallos parciales e idempotencia
4. Condiciones de carrera, supuestos de orden, estado obsoleto y reentrada
5. Estado vacío, `null`, *timeouts* y dependencias degradadas
6. Desfase de versiones, deriva del esquema, riesgos de migración y regresiones de compatibilidad
7. Huecos de observabilidad que ocultarían un fallo o dificultarían la recuperación

#### Cada hallazgo debe responder

1. ¿Qué puede salir mal?
2. ¿Por qué es vulnerable este camino de código?
3. ¿Cuál es el impacto probable?
4. ¿Qué cambio concreto reduce el riesgo?

#### Filtro final: cada hallazgo debe ser

- Adversarial, no estilístico
- Ligado a un fichero y a un rango de líneas concretos
- Plausible en un escenario de fallo real
- Accionable por quien vaya a arreglarlo

No incluyas comentarios de estilo, de nombres ni limpiezas de poco valor, ni sospechas sin evidencia.

## Paso 4 — Comprobaciones del TFG (tú, en línea)

Mientras corren las pistas, revisa lo que exige el proyecto:

1. **Comentarios.** Todo comentario nuevo o modificado cumple `docs/tfg/GUIA-COMENTARIOS.md`: está en español didáctico con tildes, explica el porqué, hay cabecera en los ficheros con lógica, no quedan comentarios en inglés heredados de la referencia y las decisiones de seguridad (RLS, cliente administrador, `security definer`, `grant`/`revoke`) están justificadas, también en SQL. Si existe el agente `revisor-comentarios`, delégale esta comprobación.
2. **Desmarcado.** `node scripts/tfg/check-branding.mjs` termina sin errores. Cualquier fallo es ❌.
3. **Documentación.** Si el cambio cierra una tarea del plan, `docs/tfg/PROGRESO.md` está actualizado; si toma una decisión de diseño, hay una entrada en `docs/tfg/DECISIONES.md`; si añade o mueve etiquetas `[TFG]`, `docs/tfg/TRAZABILIDAD.md` las refleja. Si se ha portado código de `../makerkit` o `../supamode`, está registrado en `docs/tfg/MAPA-REFERENCIAS.md`.
4. **Base de datos.** Si el diff toca `apps/web/supabase/` (políticas, `grant`, funciones `security definer`, vistas o migraciones), indica que también hay que ejecutar `/rls-review`.

## Paso 5 — Síntesis y salida

Espera a que terminen las dos pistas y combina los hallazgos.

### Hallazgos por fichero

- ✅ **PASS** — evidencia breve
- ⚠️ **WARNING** `fichero:línea` — problema + recomendación
- ❌ **FAIL** `fichero:línea` — qué puede salir mal / por qué es vulnerable / impacto / arreglo concreto

Si las dos pistas coinciden en un problema, márcalo como **[CONSENSO]**.

### Oportunidades de simplificación y arquitectura

Propuestas concretas de la Pista A donde el código podría ser:
- Más simple (menos piezas, menos abstracción)
- Mejor dividido en capas (capa equivocada, responsabilidades que se filtran)
- Más fácil de probar (acoplado al *framework*, difícil de probar de forma unitaria)
- Más idiomático para este repositorio (patrones de los `AGENTS.md`)

### Resumen del veredicto

| Categoría | Estado | Notas |
|---|---|---|
| Corrección | | |
| Seguridad | | |
| Fiabilidad / idempotencia | | |
| Arquitectura | | |
| Observabilidad | | |
| Cobertura de tests | | |
| Rendimiento | | |
| TFG (comentarios, desmarcado, docs) | | |

**Veredicto global**: SHIP / NEEDS FIXES / DO NOT SHIP

Redacta el veredicto como una decisión seca de publicar o no publicar, no como un resumen neutro.

Si hay elementos ❌ FAIL, enuméralos como una lista numerada que el autor debe resolver antes del merge.
