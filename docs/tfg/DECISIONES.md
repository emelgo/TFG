# Registro de decisiones de diseño (ADR)

Cada decisión relevante de arquitectura o de alcance se registra aquí con la skill `/decision`. Estas decisiones alimentan el capítulo de **Diseño** de la memoria. Las decisiones no se borran: si una deja de valer, se marca como *Sustituida por ADR-xxx*.

**Formato:**

```
## ADR-NNN · Título
- **Fecha:** AAAA-MM-DD · **Fase:** Fx · **Estado:** Aceptada | Propuesta | Sustituida por ADR-xxx
- **Contexto:** qué problema o fuerza obliga a decidir.
- **Decisión:** qué se hace.
- **Alternativas consideradas:** y por qué se descartan.
- **Consecuencias:** positivas, negativas y trabajo derivado.
- **Requisitos relacionados:** RF-xx / RNF-xx.
```

---

## ADR-001 · Partir de bases SaaS existentes en lugar de desarrollar desde cero
- **Fecha:** 2026-09-29 · **Fase:** F0 · **Estado:** Aceptada
- **Contexto:** el objetivo del TFG es una arquitectura *reutilizable* que acelere el desarrollo de SaaS para pymes. Escribir desde cero la autenticación, el multi-tenant, los pagos y el CMS consumiría casi todo el tiempo sin aportar valor diferencial.
- **Decisión:** reutilizar un kit SaaS comercial con licencia (TanStack Start + Supabase + Stripe) como base de la app, y un CMS para Supabase de la misma familia como base del módulo CMS. La aportación del TFG está en la integración, la adaptación a pymes, la configurabilidad, la validación y la documentación didáctica.
- **Alternativas consideradas:** desarrollo propio completo (inviable en plazo); otros *boilerplates* de código abierto (menos completos en multi-tenant y RLS); CMS genéricos como Strapi o Directus (añadirían otra base de datos u otro backend).
- **Consecuencias:** el origen queda documentado internamente en `ATRIBUCION.md` (la memoria no lo nombra, ver ADR-007) y el repositorio debe ser privado por la licencia. Además hay que desmarcar el código y traducir los comentarios (F3 y F4).
- **Requisitos relacionados:** RNF-01, RNF-04.

## ADR-002 · Monorepo único con la app y el CMS sobre una sola base de datos
- **Fecha:** 2026-09-29 · **Fase:** F0 · **Estado:** Aceptada
- **Contexto:** el CMS debe administrar los datos de la propia plataforma. Las dos bases usan el mismo scope de paquetes (`@kit/*`) y *toolchains* parecidas.
- **Decisión:** un único monorepo Turborepo con `apps/web`, `apps/cms` y `apps/cms-api`. Los paquetes de la app usan `@pymekit/*` y los del CMS `@pymekit/cms-*`. Hay una sola instancia de Supabase y el esquema del CMS convive con el público.
- **Alternativas consideradas:** dos repositorios con la misma BD (duplica la CI, el despliegue y la documentación, y dificulta la trazabilidad).
- **Consecuencias:** hay que unificar las versiones de dependencias (F2), integrar las migraciones y renombrar el scope del CMS.
- **Requisitos relacionados:** RF-09, RNF-04, RNF-07.

## ADR-003 · Idiomas del proyecto
- **Fecha:** 2026-09-29 · **Fase:** F0 · **Estado:** Aceptada
- **Contexto:** el código lo evaluará un tribunal hispanohablante y lo reutilizarán desarrolladores.
- **Decisión:** comentarios y documentación en español didáctico; identificadores en inglés; UI en español por defecto y en inglés.
- **Alternativas consideradas:** todo en español, incluidos los identificadores (choca con las API y librerías del ecosistema); todo en inglés (dificulta la evaluación del TFG).
- **Consecuencias:** hay que reescribir todos los comentarios heredados (F4) y añadir el locale `es` (F3).
- **Requisitos relacionados:** RF-13, RNF-05.

## ADR-004 · Alcance funcional: módulos que se conservan y se retiran
- **Fecha:** 2026-09-29 · **Fase:** F0 · **Estado:** Aceptada
- **Decisión:**
  - **Se conservan:** cuentas personales y de equipo (multi-tenant), roles y permisos, Stripe, el panel de super-admin y el CMS de datos.
  - **Se retiran:** el CMS de contenidos (Keystatic/WordPress), el blog, la documentación y el changelog de marketing. Se mantienen una landing mínima y la página de precios.
- **Motivo:** la propuesta pide un CMS *para la administración de contenidos y datos de la BD*, y eso lo cubre el CMS de datos. Mantener dos CMS añadiría complejidad sin aportar nada al objetivo.
- **Requisitos relacionados:** RF-01, RF-06 a RF-09.

## ADR-005 · Plataforma genérica sin dominio de negocio concreto
- **Fecha:** 2026-09-29 · **Fase:** F0 · **Estado:** Aceptada (condicionada a P-01)
- **Decisión:** no se implementa un dominio de negocio de ejemplo. La reutilización se valida midiendo el arranque de un SaaS nuevo a partir de PymeKit.
- **Consecuencias:** hay que validar con el tutor que esto cubre el apartado 5 del alcance (punto abierto P-01 en `PLAN.md`).
- **Requisitos relacionados:** RNF-01.

## ADR-006 · Retirar la comprobación de licencia remota del flujo de desarrollo
- **Fecha:** 2026-09-29 · **Fase:** F0 · **Estado:** Aceptada
- **Contexto:** la base SaaS incluye un script que consulta un servicio externo de licencias en cada `dev`.
- **Decisión:** no se copia el script ni su tarea de Turbo. La licencia se sigue respetando: el repositorio es privado y el origen está documentado en `ATRIBUCION.md`.
- **Consecuencias:** el desarrollo local no depende de la red, y el proyecto no llama a servicios de terceros no documentados.

## ADR-007 · La memoria no nombra los proyectos de referencia
- **Fecha:** 2026-09-29 · **Fase:** F0 · **Estado:** Aceptada (forma concreta pendiente de P-06)
- **Contexto:** PymeKit se construye sobre bases comerciales con licencia (ADR-001). El autor decide que el TFG presente PymeKit como producto propio, sin nombrarlas.
- **Decisión:** ni el código, ni la UI, ni la memoria mencionan los proyectos de referencia. Solo la documentación interna (`docs/tfg/`) los nombra. `check-branding` también analiza `memoria/`.
- **Consecuencias:** la redacción de la memoria (Estado del arte, Implementación) debe ser coherente con esta decisión. Cómo se presenta la parte reutilizada frente a la propia se confirma con el tutor (P-06).
