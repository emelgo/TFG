# @pymekit/email-templates

Este paquete contiene las plantillas de email transaccional y sus funciones de renderizado, hechas con React Email.

## Reglas obligatorias

1. Todo email nuevo se añade a `src/registry.ts` (`EMAIL_TEMPLATE_RENDERERS`), el catálogo central de plantillas que se exporta como `@pymekit/email-templates/registry`. Si no se registra, cualquier listado o renderizado dinámico de plantillas lo pasará por alto.
2. La función de renderizado de cada email nuevo se exporta desde `src/index.ts`.
3. Contrato de renderizado: función asíncrona que devuelve `{ html, subject }`.
4. El *namespace* de i18n coincide con el nombre del fichero de traducciones en `src/locales/<idioma>/<namespace>.json` (por ejemplo, `otp-email`).
5. Se reutilizan las piezas comunes de `src/components/*` (`wrapper`, `header`, `heading`, `content`, `cta-button`, `footer`) para mantener un diseño coherente.
6. Cada email tiene una única llamada a la acción clara y, en el cuerpo, la URL en texto plano como alternativa.
7. Asunto y cuerpo breves, orientados a la acción y sin apariencia de spam.
8. Los datos que proceden del usuario se escapan con `src/lib/escape-html.ts` antes de interpolarlos.

## Cómo añadir un email nuevo

1. Crear la plantilla en `src/emails/<nombre>.email.tsx`.
2. Si usa i18n, crear sus traducciones en `src/locales/<idioma>/<nombre>-email.json`. Hoy solo existe `es` (ADR-021). Si se añade un idioma a la app, cada email lleva también su carpeta (ver `packages/i18n/README.md`).
3. Exportar la función de renderizado desde `src/index.ts`.
4. Añadirla a `src/registry.ts` (`EMAIL_TEMPLATE_RENDERERS`).

El envío no es responsabilidad de este paquete: el HTML resultante se pasa a `@pymekit/mailers` (ver su `AGENTS.md`).
