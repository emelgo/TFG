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
- **Fecha:** 2026-09-29 · **Fase:** F0 · **Estado:** Aceptada; el blog vuelve, en la BD y gestionado desde el CMS (ADR-017)
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
- **Pendiente (debilidades menores, se revisan en F2.7; la de auditoría se resolvió en F2.6, B-27):**
  - un permiso de almacenamiento sin `bucket_name` equivale a comodín;
  - `has_permission`, `account_has_role` y `build_where_clause` son invocables con ids arbitrarios (filtran respuestas sí/no);
  - el personal puede insertar entradas de auditoría a su nombre;
  - el INSERT en `saved_view_roles` no comprueba la propiedad de la vista.
- **Requisitos relacionados:** RF-09, RF-10, RNF-02, RNF-03.

## ADR-016 · Acceso a la consola: super-admin y personal del CMS
- **Fecha:** 2026-09-29 · **Fase:** F2.3 · **Estado:** Aceptada
- **Decisión:**
  - `/admin` deja entrar a quien sea super-admin **o** tenga el claim `cms_access`.
  - Las páginas de la plataforma (`/admin`, `/admin/accounts/**`) exigen super-admin; el personal del CMS que intente abrirlas se redirige a `/admin/cms`. Las *server functions* de admin siguen protegidas por `adminFunctionMiddleware`.
  - La barra lateral muestra cada sección del CMS solo si la API lo permite (`GET /v1/account` devuelve `access`). Aun así, cada ruta y cada endpoint vuelven a comprobar el permiso.
  - **La consola exige siempre sesión aal2** (corrección posterior, a raíz de una prueba manual del autor). La versión inicial dejaba entrar a una sesión aal1 con el claim `cms_access`, que también tiene un super-admin que solo ha escrito la contraseña. Los datos no quedaban expuestos (la API y la BD exigen MFA), pero la consola se cargaba. Ahora, si hay un factor MFA configurado, se redirige a `/auth/verify?next=…`; si no hay ninguno, la respuesta es 404.
- **Motivo:** ADR-014 prevé personal del CMS con acceso limitado que no debe ver la gestión de la plataforma.
- **Consecuencias:** la interfaz del CMS carga los datos con un `fetch` isomorfo. En SSR llama a la app Hono en el mismo proceso, reenviando solo la cabecera `cookie`.
- **Requisitos relacionados:** RF-08, RF-09, RNF-02.

## ADR-017 · Blog en la base de datos gestionado desde el CMS, y esquema de demostración para pymes
- **Fecha:** 2026-09-30 · **Fase:** F2 · **Estado:** Aceptada (sustituye en parte a ADR-004)
- **Contexto:** ADR-004 retiró el blog heredado porque dependía de un CMS de contenidos basado en ficheros (Keystatic). Al revisar el CMS de datos, el autor señala que el blog es justo el caso de uso de **gestión de contenidos** que pide la propuesta: publicar desde el CMS contenido que muestra la web pública. Además, los listados del CMS muestran uuid en las claves ajenas, en lugar de un texto legible (nombre, email, título).
- **Decisión:**
  1. **Blog en la BD:** las tablas de contenido (entradas, categorías y etiquetas) van en `public`, con RLS. La lectura anónima se limita a lo publicado y la escritura solo es posible desde el CMS o por administradores. La web recupera las rutas públicas `/blog` y `/blog/$slug` (con el Markdown saneado) y el *sitemap*. Es funcionalidad real de la plataforma, así que va en esquema y migración.
  2. **Esquema de demostración para pymes:** tablas de ejemplo (clientes, productos, pedidos, facturas, empleados) con datos de prueba, **solo en desarrollo** (seed), en un esquema propio (`demo`). Sirven para enseñar y probar el CMS, y como escenario de reutilización de la propuesta (P-01).
  3. **Visualización legible:** formatos por defecto para las tablas de PymeKit y de la demo, de modo que las relaciones se muestren con el nombre, el email o el título, no con el id.
  4. **Barra lateral:** las tablas legibles aparecen bajo «Recursos», como en el CMS original.
- **Alternativas consideradas:** mantener el blog fuera (el CMS solo gestionaría datos internos y se debilitaría el objetivo de gestión de contenidos); recuperar Keystatic (dos CMS distintos, en contra de ADR-004 y ADR-011); portar la demo de blog del CMS original tal cual (en inglés, sin RLS pensada para la web pública y mezclada con `public`).
- **Consecuencias:** hay un paso nuevo, F2.6b, tras la auditoría. Hay que actualizar ADR-004, RF-01 y RF-09 y revisar las políticas del blog con `/rls-review`.
- **Requisitos relacionados:** RF-01, RF-09, RNF-02, RNF-01 (P-01).

### Anexo a ADR-017 (2026-09-30) · Acceso anónimo al esquema `public`
- Para que la web pública lea el blog, el rol `anon` recibe `usage` sobre `public`, que hasta ahora no tenía. Antes se revocan todos sus permisos residuales. Tras el cambio, `anon` solo puede leer categorías, etiquetas, la relación entre posts y etiquetas, y 13 columnas de `blog_posts`. No puede ejecutar **ninguna** función (0 de 36).
- El blog no lleva política MFA restrictiva: el contenido es público, y con ella un usuario con sesión aal1 vería un blog vacío mientras un anónimo lo vería entero.
- Las etiquetas y categorías son legibles aunque solo las usen borradores. Es una exposición menor que se acepta (un tema aún no publicado podría adelantarse).
- `/rls-review` (etapas 1–4, con refutación independiente): veredicto AISLADO. `anon-surface.test.sql` fija la superficie exacta de `anon` y falla si se amplía.

## ADR-018 · Instantánea del autor en la auditoría del CMS
- **Fecha:** 2026-09-30 · **Fase:** F2.7a · **Estado:** Aceptada
- **Contexto:** `cms.audit_logs.account_id` y `user_id` usan `ON DELETE SET NULL`. Si se borra a un miembro del personal, sus entradas dejan de indicar quién hizo cada cosa, y eso anula el valor probatorio de la auditoría (RF-10).
- **Decisión:**
  - Nuevas columnas `actor_user_id`, `actor_account_id` (sin claves ajenas) y `actor_email`.
  - Las rellena **solo** un *trigger* con los datos de la sesión al insertar; los valores que envíe quien llama se ignoran. Nunca cambian después.
  - Se mantienen las claves ajenas existentes y se rellenan las filas antiguas.
  - El email solo es legible mediante `cms.get_audit_log_actor_email`, que comprueba MFA, rango y permiso de lectura de cuentas o usuarios; los permisos por columna se escriben a mano (B-35).
  - La interfaz muestra el email guardado con la etiqueta «Eliminado» cuando el usuario ya no existe.
- **Alternativas consideradas:**
  - cambiar las claves ajenas a `RESTRICT`: impediría borrar usuarios;
  - borrado lógico de cuentas: más complejo y afecta a todas las consultas.
- **Consecuencias:** las entradas de un miembro borrado siguen atribuidas. Las que quedan sin cuenta viva solo son legibles por el rango máximo.
- **Requisitos relacionados:** RF-10, RNF-02.
