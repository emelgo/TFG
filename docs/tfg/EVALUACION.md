# Evaluación de la reutilización: escenario «Fisioterapia Bahía» (F6 · P-01)

> Rama `fase-6/escenario-ejemplo`, creada desde `fase-8/memoria` (75ff3fa). **No se fusiona a `main`**: es el experimento de evaluación que pide la propuesta («evaluación de la reutilización en un escenario de ejemplo», CU-07, RNF-01). El capítulo de la memoria está en `memoria/sections/backmatter/evaluation.tex`.

## 1. Objetivo y pregunta de evaluación

¿Cuánto trabajo cuesta que una pyme concreta adopte PymeKit y añada una funcionalidad de negocio propia, y cuánto de ese trabajo lo resuelve la plataforma sin tocar su código?

Se mide con un **caso de estudio** (evaluación observacional en el sentido de Hevner et al., 2004): se construye un escenario realista, se registra el esfuerzo y los cambios y se compara con una estimación razonada del mismo resultado sin la plataforma.

## 2. Escenario

**Fisioterapia Bahía**, clínica pequeña de Cádiz (ficticia), quiere:

| # | Necesidad | Criterio de aceptación |
|---|---|---|
| a | Identidad propia | Nombre, título, descripción y colores de la clínica sin tocar paquetes de la plataforma |
| b | Tabla de negocio `public.appointment_requests` | Nombre, correo, teléfono, servicio, fecha preferida, estado, notas internas; RLS; el público no puede leer; alta solo controlada |
| c | Gestión en el CMS | Área propia «Citas», nombres y ayudas en español |
| d | Formulario público «Pedir cita» | Ruta de marketing, TanStack Form + `@pymekit/ui/field`, textos i18n, ayuda «?» |
| e | Pruebas | pgTAP de las políticas y E2E corto (envío del formulario → el super-admin lo ve en el CMS) |

## 3. Procedimiento

1. Rama nueva y base anotada (`git rev-parse HEAD` = 75ff3fa).
2. Marca de tiempo (`date -Is`) al empezar y terminar cada paso (P0–P6).
3. Desarrollo siguiendo exclusivamente los patrones documentados (`AGENTS.md`, plantilla de tabla de `apps/web/supabase/AGENTS.md`, migraciones de metadatos del CMS de la F3c, formulario de contacto como modelo).
4. Instantánea de la BD local antes (número y *hash* de `cms.table_metadata`, objetos de `public`, migraciones, políticas, auditoría) y comparación al final tras retirar lo creado.
5. Recuento de cambios con `git diff --cached --stat` respecto a la base y clasificación de cada fichero (nuevo / configuración / generado / código existente de la plataforma).
6. Verificación proporcionada: pgTAP del escenario (más `anon-surface`, `privileges`, `schema-conditions` y `blog` como regresión), E2E del escenario, `pnpm typecheck`, `pnpm lint`, `pnpm format`, `check-branding` y los tests unitarios de `@pymekit/i18n`.

El desarrollo lo hizo un agente de IA (Claude) en modo ahorro, con el repositorio ya conocido. **Los tiempos medidos son los de ese agente**, no los de una persona; por eso la comparación con «desde cero» se hace con una estimación para un desarrollador humano en ambos lados (§6).

## 4. Qué se hizo

| Necesidad | Solución | Ficheros |
|---|---|---|
| a | Variables `VITE_PRODUCT_NAME`, `VITE_SITE_TITLE`, `VITE_SITE_DESCRIPTION`, `VITE_SHOW_TFG_INFO=false`; tokens de color en `custom.css` (punto de extensión que se importa el último). El logo tenía «PymeKit» escrito a mano: se cambió para leer `appConfig.name` (fricción F-1) | `apps/web/.env`, `apps/web/src/styles/custom.css`, `apps/web/src/components/app-logo.tsx` |
| b | `schemas/56-appointment-requests.sql` con la plantilla de tabla: RLS, `revoke all` a los tres roles, **ningún privilegio para `anon` ni `authenticated`**, solo `service_role`; enumerados `appointment_service` y `appointment_request_status`; `check` de formato; consentimiento RGPD (`privacy_accepted_at`). Alta por *server function* validada con Zod (+ CAPTCHA opcional) con el cliente `service_role`, solo INSERT de las columnas del visitante | `schemas/56-…sql`, `migrations/20261020120000_appointment_requests.sql`, `src/lib/appointments/*` |
| c | En la misma migración, `cms.sync_managed_tables('public','appointment_requests')` y `UPDATE` de `cms.table_metadata` (nombre, descripción, `ui_config.navigation_group = 'Citas'`, orden, `display_format`, nombre/ayuda/solo-lectura por columna). Etiquetas de los enumerados en `common.enums.*`, que el CMS ya usa | migración, `packages/i18n/src/messages/es/common.json` |
| d | Ruta `/_marketing/appointments`, componente con `FieldLabelWithHelp`, `NativeSelect`, `Checkbox`, `CaptchaField`; mensajes de error como claves i18n (`FieldError` las traduce); enlace en `marketing-navigation.config.tsx` | `src/routes/_marketing/appointments.tsx`, `src/components/marketing/appointment-request-form.tsx`, `marketing.json` |
| e | `appointment-requests.test.sql` (37 aserciones) y `tests/scenario/appointment-requests.spec.ts` con su *Page Object*; `playwright.scenario.config.ts` para apuntar al puerto 3300 | `tests/database/…`, `apps/e2e/…` |

**Decisión de diseño (b):** se descartó conceder INSERT a `anon` con política RLS porque ampliaba la superficie pública de la BD (ADR-017: `anon` solo lee el blog) y obligaba a modificar `anon-surface.test.sql`, un test de la plataforma. La *server function* con `service_role` mantiene esa superficie intacta y acota lo que hace el cliente administrador (solo INSERT, columnas fijas, sin `returning`).

## 5. Métricas

### 5.1 Tiempo por paso (reloj del agente)

| Paso | Inicio | Fin | Minutos |
|---|---|---|---|
| P0 Lectura de directrices y patrones | 12:58:55 | 13:01:51 | 3 |
| P1 Identidad (a) | 13:01:51 | 13:04:44 | 3 |
| P2 BD, metadatos del CMS y pgTAP (b, c, e) | 13:04:44 | 13:08:23 | 4 |
| P3 Formulario, *server function*, i18n (d) | 13:08:23 | 13:11:13 | 3 |
| P4 E2E (e) | 13:11:13 | 13:32:05 | 21 |
| P5 Verificación global y limpieza de la BD | 13:32:05 | 13:34:55 | 3 |
| P6 Documentación | 13:34:55 | — | (fuera de la medida) |
| **Total implementación + verificación** | | | **≈ 36** |

Las fronteras entre P0–P2 son aproximadas (parte de la exploración del CMS ocurrió dentro de P1/P2). P4 se fue casi entero en fricciones de entorno (F-5, F-6), no en escribir la prueba.

### 5.2 Volumen de cambios (`git diff --cached --stat` respecto a 75ff3fa)

18 ficheros, **+1415 / −10** líneas.

| Clase | Ficheros | Líneas | Detalle |
|---|---|---|---|
| Nuevos, web (TS/TSX) | 4 | 501 (370 de código, 74 de comentario) | formulario, esquema Zod, *server function*, ruta |
| Nuevos, SQL | 2 | 317 (187 de código, 83 de comentario) | esquema declarativo + migración (la migración repite el DDL del esquema, ≈ 70 líneas) |
| Nuevos, pgTAP | 1 | 228 (156 de código) | 37 aserciones |
| Nuevos, E2E | 3 | 189 (120 de código) | spec, *Page Object*, config de puerto |
| Configuración / contenido | 5 | 92 | `.env`, `custom.css`, `marketing-navigation.config.tsx`, `common.json`, `marketing.json` |
| Generados | 2 | 90 | `routeTree.gen.ts`, `database.types.ts` |
| Código existente modificado | 1 | 8 | `app-logo.tsx` (F-1) |

### 5.3 Ficheros de la plataforma tocados

| Ámbito | Tocados | Naturaleza |
|---|---|---|
| Lógica de `packages/*` (TS/TSX, SQL del CMS) | **0** | — |
| `packages/i18n/src/messages/es/*.json` | 2 | Contenido (textos), es el sitio que fija ADR-021 para los textos |
| `packages/supabase/src/database.types.ts` | 1 | Generado por `supabase:web:typegen` |
| Código existente de `apps/web` | 1 | `app-logo.tsx`: nombre del producto escrito a mano (F-1) |
| Esquemas/migraciones/tests existentes de la BD | **0** | — |

Objetivo «cero o casi»: **cumplido**; el único cambio de código existente revela un punto de configuración que faltaba.

### 5.4 Qué se obtuvo gratis

| Capacidad | De dónde sale | Esfuerzo del escenario |
|---|---|---|
| Inicio de sesión del personal con MFA (aal2) | `packages/features/auth`, `cms.verify_admin_access` | 0 |
| Listado, búsqueda, filtros, orden, paginación, ficha y edición de las citas | Explorador de datos del CMS (`packages/cms/*`, ≈ 64 000 líneas TS y 9 300 SQL) | 1 llamada a `sync_managed_tables` + 2 `UPDATE` de metadatos |
| Área «Citas» en la barra lateral | `ui_config.navigation_group` (F3c) | 1 clave JSON |
| Ayuda «?» en los formularios del CMS | `columns_config.<col>.description` | 12 textos |
| Etiquetas legibles de los enumerados (CMS y web) | `resolveEnumLabel` + `common.enums` | 9 textos |
| Autorización del personal (super-admin raíz, rol Soporte sin acceso) | RBAC del esquema `cms` + `has_data_permission` | 0 (comprobado en pgTAP) |
| Auditoría de cada cambio hecho desde el CMS | `cms.update_record` → `cms.audit_logs` | 0 (comprobado en pgTAP) |
| Campos, ayuda contextual, selector, casilla, alertas | `@pymekit/ui` | 0 |
| CAPTCHA opcional, `errorMiddleware`, *logger*, cliente administrador | `@pymekit/auth`, `function-middleware`, `shared`, `supabase` | 0 |
| Mensajes de Zod en español, i18n | `zod-locale.ts`, `@pymekit/i18n` | 0 |
| *Layout* público, tema claro/oscuro, metadatos de la página | `_marketing/route.tsx`, `app.config.ts` | 0 |
| `updated_at` automático | `public.trigger_set_timestamps` | 1 *trigger* |
| Infraestructura de pruebas (helpers pgTAP, sesiones E2E, *Page Objects* del CMS) | `tests/database/0000*`, `auth.setup.ts`, `cms/*.po.ts` | 0 |

## 6. Comparación con un desarrollo desde cero (estimación razonada)

No es una medida: es una estimación para **un desarrollador con experiencia media en el mismo *stack*** (React, Postgres/Supabase), que construye solo lo imprescindible para este escenario (no un CMS genérico).

| Componente necesario sin PymeKit | Horas estimadas | Justificación |
|---|---|---|
| Autenticación del personal con MFA y protección de rutas | 12–20 | Alta, sesión, TOTP, guardia en servidor y en la BD |
| Panel de gestión de una tabla (listado con búsqueda/filtro/orden/paginación, ficha, edición con validación) | 16–32 | Equivale a una fracción pequeña del explorador reutilizado |
| Roles del personal (quién lee/edita citas) aplicados en la BD | 8–14 | Tablas de roles, función de permiso, políticas y pruebas |
| Auditoría de cambios | 6–10 | Tabla, *trigger* o capa de servicio, consulta |
| Componentes de formulario accesibles, ayuda contextual, i18n, mensajes de validación | 6–12 | |
| Identidad visual configurable (tokens, metadatos, logo) | 2–4 | |
| Tabla, RLS y pruebas de la BD | 4–8 | Similar en ambos casos |
| Formulario público y *endpoint* validado | 3–5 | Similar en ambos casos |
| Infraestructura de pruebas (pgTAP, E2E con sesiones) | 6–10 | |
| **Total** | **63–115 h** | |

**Con PymeKit**, una persona que ya conozca la plataforma necesitaría, por el volumen escrito (≈ 830 líneas de código sin comentarios entre web, SQL y pruebas) y porque todo sigue patrones existentes, una estimación de **6–10 h** (el agente tardó ≈ 36 min de reloj, de los que ≈ 13 fueron lectura e implementación). Solo las dos últimas filas de la tabla (≈ 7–13 h desde cero) corresponden a trabajo que el escenario sí tuvo que hacer; el resto lo aportó la plataforma. La reducción estimada es de **un orden de magnitud** (≈ 85–92 %).

## 7. Fricciones encontradas

| Id | Fricción | Impacto | Propuesta para `main` |
|---|---|---|---|
| F-1 | El logo pinta «PymeKit» escrito a mano en `app-logo.tsx` en vez de `appConfig.name`; el símbolo «P» y los *favicons* también son de PymeKit | Única modificación de código existente | Leer el nombre de la configuración y permitir un logo propio por variable o fichero en `public/` |
| F-2 | El test E2E de la plataforma `cms-sidebar-areas.spec.ts` espera **exactamente cuatro** áreas; con «Citas» habría cinco | Rompe la suite de la plataforma en cuanto una pyme añade un área (deducido del código; no se ejecutó la suite completa) | Comprobar que existen las áreas de la plataforma, no su número total |
| F-3 | No hay un patrón listo para «alta pública sin lectura»: ADR-017 y `anon-surface.test.sql` fijan que `anon` solo lee el blog | Hubo que elegir entre cliente administrador o tocar un test de la plataforma | Documentar el patrón (*server function* + `service_role`) o una lista de excepciones configurable en el test |
| F-4 | El flujo documentado de migraciones (`db:diff` con BD *shadow*) se sustituyó por una migración escrita a mano que repite el DDL del esquema | ≈ 70 líneas duplicadas y riesgo de divergencia no comprobado con `db:diff` | Mantenerlo en el flujo normal; para escenarios rápidos, un *script* que compruebe la equivalencia |
| F-5 | El puerto lo fija `PORT` del `.env` (el *plugin* del servidor lo antepone a `--port`) y Playwright tiene la URL base fija (`localhost:3100`) | No se podía levantar una segunda copia ni apuntarle las pruebas sin investigar | Documentar `PORT=…` y leer la URL base de una variable en `playwright.config.ts` |
| F-6 | Contra el servidor de desarrollo, el inicio de sesión del *setup* E2E rellena el formulario antes de la hidratación y se envía como GET nativo | Las pruebas solo pasan contra una *build* (`vite build --mode test` con `VITE_CI=true`) | Esperar a la hidratación en `AuthPageObject.signIn`, como ya hace el explorador de datos |
| F-7 | Personalizar el CMS por migración exige conocer la forma JSON de `columns_config` | Curva de aprendizaje; el mismo `UPDATE` se repite en cada migración de metadatos | Una función `cms.set_column_labels(...)` o aceptar un JSON declarativo; alternativa sin código: Ajustes → Recursos |
| F-8 | Los textos de la app de la pyme viven en un paquete de la plataforma (`packages/i18n`) y los tipos de sus tablas en `packages/supabase` | Acoplamiento: una actualización de la plataforma choca con los cambios de la pyme | Espacio de mensajes y tipos propios de la app, fusionados con los de la plataforma |
| F-9 | La migración deja tres entradas en `cms.audit_logs` (el *trigger* audita `cms.table_metadata`) y la retirada, otra; la auditoría es, a propósito, de solo inserción | La BD local no puede volver exactamente a su estado previo sin manipular la auditoría | Ninguna: es el comportamiento correcto; se deja constancia |

## 8. Resultados de las pruebas

| Prueba | Resultado |
|---|---|
| pgTAP `appointment-requests.test.sql` | 37/37 |
| pgTAP de regresión `anon-surface`, `privileges`, `schema-conditions`, `blog` | 16/16, 6/6, 1/1, 58/58 |
| E2E `tests/scenario` (con el *setup* de sesiones) contra la *build* en el puerto 3300 | 6/6 (4 *setup* + 2 del escenario), 18 s |
| `pnpm typecheck` | 52/52 tareas |
| `pnpm lint`, `pnpm format` | sin avisos |
| `node scripts/tfg/check-branding.mjs` | 0 referencias |
| `vitest` de `@pymekit/i18n` | 11/11 |

Los ficheros pgTAP se ejecutaron uno a uno con `psql` dentro de su transacción con `rollback` (creando `pgtap` dentro de ella), porque `supabase test db` ejecuta la suite entera.

## 9. Estado de la base de datos local

La migración se aplicó con `psql` en una transacción (sin registrarla en `supabase_migrations`) y al terminar se retiró con `delete` de su fila en `cms.table_metadata` y `drop` de la tabla y de los dos enumerados. Comparación de instantáneas:

| Medida | Antes | Después |
|---|---|---|
| `cms.table_metadata` (filas · *hash*) | 19 · 309b436d… | 19 · 309b436d… |
| Relaciones / tipos / funciones de `public` | 91 / 58 / 36 | 91 / 58 / 36 |
| Migraciones aplicadas (última) | 30 (20261002160000) | 30 (20261002160000) |
| Políticas | 127 | 127 |
| `cms.audit_logs` | 469 | 473 (F-9) |

Además, el *setup* E2E abrió sesiones de los usuarios del *seed* (filas en `auth.sessions`), igual que cualquier ejecución E2E del autor.

## 10. Conclusiones

1. **Reutilización efectiva:** las cinco necesidades se cubrieron sin modificar la lógica de ningún paquete; el CMS completo (gestión, permisos, auditoría, ayuda, áreas) se obtuvo con configuración en forma de datos.
2. **La configuración es el punto fuerte** (`.env`, `custom.css`, metadatos del CMS, i18n); el punto débil está en los **bordes**: el logo, las pruebas de la plataforma que suponen sus propios datos y la ergonomía del entorno de pruebas.
3. El caso de estudio produce una lista accionable (F-1…F-8) para mejorar la reutilización en `main`.
4. Limitaciones: un solo escenario, sencillo y elegido por el propio autor; desarrollo hecho por un agente de IA que ya conocía el repositorio; estimación «desde cero» no medida.
