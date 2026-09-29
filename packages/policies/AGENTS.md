# @pymekit/policies: sistema de políticas basado en registros

Permite expresar reglas de negocio (por ejemplo, «hace falta una suscripción activa para invitar») como políticas declarativas, agruparlas en registros y evaluarlas por etapas.

## Reglas obligatorias

1. SIEMPRE se usa `definePolicy` con un `id` único y la política se registra en un registro creado con `createPolicyRegistry()`.
2. NUNCA se escriben políticas en línea en el código de una funcionalidad: se definen en un fichero de registro.
3. SIEMPRE se devuelve `allow()` o `deny()`; `deny` recibe un código de error, un mensaje y, cuando procede, instrucciones de solución (`{ code, message, remediation }`). Mensaje y solución son claves i18n.
4. SIEMPRE se asignan etapas (`stages`, por ejemplo `preliminary` y `submission`) para que la evaluación pueda filtrar por etapa.
5. Para cargar políticas por su id se usa `createPoliciesFromRegistry(registry, specs)`, que admite ids simples o tuplas con configuración (`['<id>', config]`).
6. SIEMPRE se evalúa con un evaluador creado por `createPoliciesEvaluator()`: `evaluate(registry, context, operator, stage)` para un registro, o `evaluatePolicies()` / `evaluateGroups()` para listas y grupos de políticas. `hasPoliciesForStage(registry, stage)` indica si hay algo que evaluar.
7. NUNCA se evalúa sin indicar el operador (`ALL` = Y lógico, `ANY` = O lógico).

## Imports clave

- `definePolicy`, `allow`, `deny`, `createPolicyRegistry`, `createPoliciesFromRegistry` y `createPoliciesEvaluator`, todos de `@pymekit/policies`.

## Ejemplos de referencia

- `packages/features/team-accounts/src/server/policies/policies.ts`: registro real (`invitationPolicyRegistry`) con una política por etapas.
- `packages/features/team-accounts/src/server/policies/invitation-policies.ts`: evaluador que lo aplica con el operador `ALL`.
