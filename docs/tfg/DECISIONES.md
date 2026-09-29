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
- **Fecha:** 2026-09-29 · **Fase:** F0 · **Estado:** Aceptada en parte; la estructura de apps separadas queda sustituida por ADR-011
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

## ADR-008 · Descartar el servidor MCP y el generador de configuración heredados
- **Fecha:** 2026-09-29 · **Fase:** F1 · **Estado:** Aceptada (cierra P-03)
- **Contexto:** la base SaaS incluye `packages/mcp-server` (un servidor MCP para que los asistentes de IA consulten la documentación comercial de la base y el estado del proyecto) y un generador Turbo `setup` que registra la licencia y el repositorio *upstream*.
- **Decisión:** no se incorporan a PymeKit. Tampoco el generador `keystatic` (ADR-004). Se conservan los generadores `package`, `docker` y `cloudflare`, útiles para la reutilización (RNF-01) y el despliegue (F7).
- **Alternativas consideradas:** conservar el servidor MCP renombrado. Se descarta porque su valor depende de la documentación comercial, que no se incluye en el repositorio. El *harness* de `AGENTS.md` y `.claude/` cumple esa función para PymeKit.
- **Consecuencias:** se eliminan `.mcp.json` y 16 ficheros con marca, y el flujo de desarrollo deja de depender de la licencia y de la red.
- **Requisitos relacionados:** RNF-04, RNF-05.

## ADR-009 · La app web escucha en el puerto 3100
- **Fecha:** 2026-09-29 · **Fase:** F1 · **Estado:** Aceptada
- **Contexto:** la base usa el puerto 3000, que en el equipo de desarrollo ya ocupa otro servicio. Además, en la referencia del CMS su API también usa el 3000 (conflicto previsto en F2).
- **Decisión:** la web usa el **3100** en desarrollo (`vite.config.ts`, con `strictPort`), en producción local (`PORT` en `.env`/`.env.test`), en Supabase Auth (`site_url`, redirecciones, `rp_origins`), en el webhook del seed, en Playwright, en el reenvío de Stripe y en la CI. Dentro de los contenedores Docker se mantiene el 3000 interno.
- **Consecuencias:** los puertos del CMS se asignarán en F2 sin chocar (se propone la franja 31xx).
- **Requisitos relacionados:** RNF-07.

## ADR-010 · Aislar de Internet los servicios locales del entorno de desarrollo
- **Fecha:** 2026-09-29 · **Fase:** F2 · **Estado:** Aceptada
- **Contexto:** el entorno de desarrollo es un servidor remoto (VPS con IP pública). Supabase local publica sus puertos (54321–54327) en `0.0.0.0` mediante Docker, que se salta UFW, y usa credenciales conocidas públicamente (`postgres/postgres` y las claves de desarrollo). Durante la F1 la API quedó accesible desde Internet durante aproximadamente una hora (solo con datos de prueba).
- **Decisión:**
  - Regla persistente en la cadena `DOCKER-USER` (`/etc/ufw/after.rules`, con copia de seguridad `after.rules.bak-pymekit`) que descarta el tráfico entrante por `eth0` hacia 54321–54327.
  - Se borraron los volúmenes de la instancia expuesta.
  - La app se consulta mediante un túnel SSH (`ssh -L 3100:localhost:3100 …`), nunca abriendo puertos.
- **Consecuencias:** cualquier servicio nuevo en Docker (por ejemplo, el CMS en F2 o los contenedores de F7) debe revisarse con este mismo criterio. El manual de instalación (F7) documentará el riesgo.
- **Requisitos relacionados:** RNF-02, RNF-07.

## ADR-011 · Integración total del CMS en la consola de administración (P-07)
- **Fecha:** 2026-09-29 · **Fase:** F2 · **Estado:** Aceptada (sustituye la parte de apps separadas de ADR-002)
- **Contexto:** el CMS de referencia es una SPA (Vite + React Router, ~30 pantallas, fuertemente acoplada a las APIs de datos de React Router) con una API Hono y Drizzle. La web usa TanStack Start. El autor propuso integrarlo en la consola de super-admin.
- **Decisión:** el CMS pasa a formar parte de `apps/web`:
  - **API:** la aplicación Hono del CMS se monta dentro del servidor de la web en `/api/cms/*` (ruta de servidor de TanStack Start). Se reutilizan sus servicios Drizzle y sus rutas.
  - **Interfaz:** las pantallas se reescriben como rutas de TanStack Router bajo `/admin/cms/*`, con *loaders* y mutaciones (TanStack Query + cliente RPC de Hono) en lugar de `loader`/`action`/`useFetcher`.
  - Se hace por incrementos (F2.1–F2.9 en `PLAN.md`), cada uno funcional y verificado.
- **Alternativas consideradas:**
  - (a) apps separadas (3–6 días; tres servicios, dos logins y cookies duplicadas);
  - (c) híbrida, con la API integrada y la SPA servida como estática (1–2 semanas; dos routers y dos formas de programar conviviendo).
- **Consecuencias:** mayor esfuerzo (estimado en 6–12+ semanas). A cambio hay un único servicio, un único login y un único estilo de código, y un caso de estudio de integración para la memoria. Si el plazo aprieta, los paneles (RF-11, deseable) son el primer candidato a recortar.
- **Requisitos relacionados:** RF-08, RF-09, RF-10, RF-11, RNF-04, RNF-05.

## ADR-012 · El esquema SQL del CMS se llama `cms` (P-02)
- **Fecha:** 2026-09-29 · **Fase:** F2 · **Estado:** Aceptada
- **Decisión:** el esquema del CMS se renombra a `cms` en migraciones, funciones, políticas, esquema Drizzle, API y tests. Se hace de forma mecánica y se verifica con pgTAP.
- **Motivo:** es coherente con el desmarcado (ADR-007) y con el nombre funcional del módulo.
- **Alternativa descartada:** mantener el nombre original, que obligaría a añadir una excepción permanente en `check-branding` y lo dejaría visible en la BD y en Supabase Studio.

## ADR-013 · Una sola pila de librerías en toda la web (CMS incluido)
- **Fecha:** 2026-09-29 · **Fase:** F2 · **Estado:** Aceptada
- **Decisión:** al portar el CMS se unifica con lo que ya usa la web:
  - formularios con `@tanstack/react-form` + `@pymekit/ui/field` (sustituye a react-hook-form);
  - i18n con `use-intl` a través de `@pymekit/i18n` (sustituye a i18next);
  - componentes de `@pymekit/ui`, incorporando solo los que falten (sustituye al kit de UI duplicado).
- **Motivo:** una sola forma de hacer cada cosa (RNF-05). Además, el español (F3) solo hay que añadirlo en un sistema.
- **Consecuencias:** hay que migrar unos 64 formularios y unos 183 ficheros con textos. Las skills `react-form-builder` y `service-builder` deben actualizarse: el sabor «CMS con react-hook-form» deja de aplicarse.

## ADR-014 · El super-admin es la raíz del CMS; el RBAC del CMS se mantiene para el resto del personal
- **Fecha:** 2026-09-29 · **Fase:** F2 · **Estado:** Aceptada
- **Decisión:**
  - Un super-admin de la plataforma (`is_super_admin()`, con MFA) accede al CMS con todos los permisos, sin configuración adicional. Para ello hay «pegamento» entre los dos modelos: función o *trigger* que le da acceso y le asigna el rol raíz.
  - El RBAC propio del CMS (roles, grupos y permisos por tabla o almacenamiento) se conserva para dar acceso **limitado** a otro personal (soporte, gestor de contenidos).
- **Alternativa descartada:** solo super-admin, sin RBAC granular (incumpliría RF-09, «con permisos propios»).
- **Requisitos relacionados:** RF-08, RF-09, RNF-02.

## ADR-015 · Endurecimiento de seguridad del CMS heredado
- **Fecha:** 2026-09-29 · **Fase:** F2.1 · **Estado:** Aceptada
- **Contexto:** la revisión adversarial `/rls-review` del esquema `cms` portado encontró fallos en el código heredado. Algunos se confirmaron con pruebas ejecutadas; otros se detectaron en la lectura estática.
- **Decisión:** se corrigen en las migraciones `20260929120600_cms_mfa_fail_closed`, `20260929120700_cms_rls_hardening` y `20260929120800_cms_rls_hardening_2`, cada una con su test de regresión (`cms-isolation.test.sql`, `cms-super-admin-root.test.sql`):
  1. **Brecha de escalada (confirmada):** las políticas `UPDATE` de `role_permissions`, `account_permissions` y `permission_group_permissions` no tenían `WITH CHECK`. Un administrador delegado podía cambiar `permission_id` para colgar de un rol inferior un permiso que él no poseía. Se añade `WITH CHECK` con `can_grant_permission`.
  2. **MFA que fallaba en abierto:** con MFA configurado y sesión aal1, la política restrictiva ocultaba la opción `requires_mfa`, y el CMS la interpretaba como «opcional». Ahora se lee con `cms.get_mfa_requirement()` (`security definer`), y una opción ausente o no válida cuenta como «obligatorio».
  3. **Lectura de esquemas protegidos:** `query_table` y `get_record_by_keys` no llamaban a `validate_schema_access`, y `query_table` tampoco a `verify_admin_access`. Con un permiso comodín, como el de Root, se podía leer `auth.users`. Ahora ambas exigen las dos comprobaciones.
  4. **Paneles:** `can_access_dashboard`, `can_edit_dashboard` y `list_dashboards` no exigían acceso de administración vigente. Ahora sí lo exigen (claim, cuenta activa y MFA).
  5. **Marcadores de sistema:** hay índices únicos para el rol y el grupo raíz.
  6. **Catálogos del sistema (hallado en la refutación independiente, gravedad alta):** `validate_schema_access` no bloqueaba `pg_catalog`. Root podía leer `pg_authid`, con los hashes de contraseña de los roles de Postgres. Ahora se bloquea cualquier esquema `pg_*` (migración `20260929120800_cms_rls_hardening_2`).
  7. **Política tautológica:** en `view_role_permissions`, `ar.role_id = role_id` comparaba la columna consigo misma y cualquiera con un rol veía todas las asignaciones. Ahora cada usuario ve las de sus roles, y quien tiene `permission:select` las ve todas.
  8. **Deriva heredada:** 4 funciones cuyo esquema declarativo no coincidía con las migraciones (`can_read_audit_log`, `create_dashboard`, `grant_admin_access` y `share_dashboard_with_role`) se alinean con la versión de las migraciones.
- **Pendiente (debilidades menores, se revisan en F2.7):**
  - un permiso de almacenamiento sin `bucket_name` equivale a comodín;
  - `has_permission`, `account_has_role` y `build_where_clause` son invocables con ids arbitrarios (filtran respuestas sí/no);
  - el personal puede insertar entradas de auditoría a su nombre;
  - el INSERT en `saved_view_roles` no comprueba la propiedad de la vista.
- **Requisitos relacionados:** RF-09, RF-10, RNF-02, RNF-03.
