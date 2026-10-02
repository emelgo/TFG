# Progreso del TFG

<!-- El hook SessionStart lee la línea «Fase actual» y las casillas sin marcar de la fase actual. Mantén este formato. -->

**Fase actual:** F3

## F0 · Harness y planificación
- [x] Directrices (`AGENTS.md`, `CLAUDE.md`)
- [x] Plan, requisitos, guías y registros en `docs/tfg/`
- [x] Configuración de Claude Code (permisos, hooks, skills y agentes)
- [x] Scripts `check-branding` y `report-comments`
- [x] CI mínima
- [x] Repositorio remoto en GitHub configurado (P-05)
- [x] Primer commit y push a `main`

## Pendientes transversales (no bloquean el avance de fase)
- [ ] P-04 · Plantilla LaTeX de Overleaf: el autor pasará el `.zip` → integrarla en `memoria/` (ver `memoria/README.md`)
- [ ] P-01 · Escenario de ejemplo para evaluar la reutilización: se abordará más adelante (a más tardar, antes de F6)
- [ ] P-06 · Confirmar con el tutor cómo presenta la memoria la parte reutilizada sin nombrar las referencias (ADR-007)

## F1 · Base SaaS importada y funcionando
- [x] Copia de la referencia SaaS (sin excluidos)
- [x] Renombrado `@kit/*` → `@pymekit/*` (0 referencias; bloqueante en la CI)
- [x] Retirados el CMS de contenidos, el blog, la documentación y el changelog
- [x] ADR sobre el servidor MCP (ADR-008)
- [x] Typecheck (25 paquetes), lint, formato, tests unitarios (61) y build de producción en verde
- [x] CI unificada (`.github/workflows/ci.yml`)
- [x] `AGENTS.md` de cada paquete traducidos y adaptados (11) y corregidas sus discrepancias con el código
- [x] Docker accesible (usuario en el grupo `docker`)
- [x] Supabase local arrancando: `project_id = "pymekit"`, 4 migraciones y seed
- [x] Web en el puerto 3100 (ADR-009)
- [x] pgTAP: 27 ficheros, 396 tests en verde
- [x] E2E: 43 pasan, 1 omitido (billing desactivado) y 1 inestable (*flaky*: `admin.spec.ts` › «ban user flow», pasa al reintentar)
- [x] Corregido un fallo del renombrado: la regex `noExternal` de `vite.config.ts` conservaba el scope original escapado (`check-branding` ya detecta esa forma)
- [x] CU-01 probado a mano por el autor: registro y login funcionan (vía túnel SSH)
- [x] Job de E2E activado en GitHub (`ENABLE_E2E_JOB` y secretos de Supabase). Para ahorrar minutos, solo se ejecuta en PR a `main` y a mano (*Run workflow*). Los secretos de Stripe se añadirán en F5
- [ ] Estabilizar los E2E inestables bajo carga (`--workers=4`) antes de F6: admin «ban user flow», «MFA configured but not verified», «delete team account flow», dos de autenticación y `cms-display-formats` › membresía enlazada a la cuenta (todos pasan en serie)
- [ ] El setup de auth de los E2E falla contra `pnpm dev` (envía el formulario antes de la hidratación); de momento los E2E se lanzan contra la build de test

## F2 · Integración del CMS (en `/admin/cms`, ADR-011)
- [x] Análisis del código del CMS y decisión de P-07 (ADR-011 a ADR-014)
- [x] F2.1 · BD: esquema `cms` (34 esquemas, 9 migraciones), pegamento super-admin → Root (ADR-014) y MFA obligatorio por defecto
- [x] F2.1 · `/rls-review` completa (etapas 1–4): 2 brechas heredadas confirmadas y corregidas (escalada por UPDATE sin WITH CHECK; lectura de `pg_catalog.pg_authid`), más 5 endurecimientos y la alineación de 4 funciones desincronizadas (ADR-015). La refutación independiente confirmó el resto. pgTAP: 57 ficheros, 1.550 tests en verde
- [x] F2.2 · API: 19 paquetes `@pymekit/cms-*` (solo servidor), Hono montado en `/api/cms/$`, auth con la sesión de PymeKit + `cms.verify_admin_access()` (403 sin MFA o con la cuenta inactiva). 1.130 tests unitarios y 11 E2E de la API en verde
- [x] F2.3 · Base de UI: `/admin` admite super-admins y personal del CMS (`has_cms_access`); las páginas de plataforma siguen siendo solo de super-admin (ADR-016). Layout `/admin/cms` con comprobación de acceso y aviso de MFA, barra lateral «Plataforma»/«CMS» según permisos, paquete cliente `@pymekit/cms-ui-core`, fetch isomorfo (SSR sin salto de red), namespace i18n `cms` (en) y usuario de demo `cms-staff@pymekit.test` (rol Soporte). E2E: 60 ✔ (8 nuevos del CMS)
- [ ] Pendientes de F2.3 para F2.4–F2.8: filtrado por pestaña en Ajustes y Paneles; visibilidad de Almacenamiento aproximada (cualquier permiso de lectura); `/v1/permissions` registrado dos veces (paquetes permissions y settings)
- [x] F2.4a · Listado del explorador de datos en `/admin/cms/resources/$schema/$table`: paginación, orden, filtros (fechas relativas, JSON, autocompletado de relaciones), búsqueda, columnas (visibilidad, fijado y orden), formato por tipo y vistas guardadas. Paquetes nuevos `@pymekit/cms-{filters,table,data-explorer-ui}`. Unit 1.313 ✔, E2E 69 ✔
- [x] F2.4b · Ficha de registro (solo lectura) con claves simples y compuestas, diseño guardado o por defecto, registros relacionados (O2M y M2M) y enlaces de claves ajenas según permisos. La API devuelve 403/404 en lugar de 500. E2E 76 ✔
- [ ] Mejoras menores (F2.4b): una clave compuesta de texto con aspecto numérico (`1e3`) se normaliza al leer la URL; los campos HTML/Markdown se muestran escapados y las rutas de Storage como texto
- [x] F2.4c · Crear, editar y borrar (TanStack Form + Zod desde los metadatos), borrado en lote, edición en línea, acciones O2M/M2M en la ficha; permisos por acción en la UI y la API; errores con códigos estables (`RECORD_*`) sin texto interno. Corregido el borrado/edición masivo por condiciones no clave (B-19). pgTAP 1.551, E2E 86 ✔
- [x] F2.4 · Explorador de datos completo (RF-09)
- [ ] Pendiente (F2.4c): E2E de vincular/desvincular M2M y de edición en línea (no hay tabla puente en el seed); editores de ficheros, texto enriquecido y direcciones; la inserción ignora en silencio columnas no editables y los fallos de auditoría se silencian (heredado, revisar en F2.6)
- [ ] Mejora menor (F2.4): el filtro por autocompletado muestra el id si la fila relacionada no está en la página actual
- [x] F2.5 · Explorador de usuarios (listado, ficha, crear/invitar, bloquear, restablecer, borrar, lote, acceso al CMS) y de almacenamiento (buckets, carpetas, subida, renombrado, borrado, vista previa). Paquetes `@pymekit/cms-{users,storage}-explorer-ui`. 9 fallos heredados corregidos por el agente y 2 más en la revisión posterior (B-21 a B-26). E2E 102 (14 nuevos)
- [ ] Pendiente (F2.5): renombrar carpetas; E2E de invitar, enlace de acceso y retirada de MFA
- [x] F2.6 · Auditoría (RF-10): listado con filtros, detalle con diferencias, auditoría por miembro; búsqueda global ⌘K según permisos. Paquete `@pymekit/cms-audit-logs-ui`. Corregidas la falsificación de auditoría y las fugas de la búsqueda (B-27, B-28). pgTAP 1.583, unit 1.518, E2E 110
- [x] F2.6 · `/rls-review` (etapas 1–4): veredicto AISLADO, sin brechas; +31 pruebas (`cms-audit-isolation.test.sql`). pgTAP 59 ficheros / 1.614
- [x] F2.6 · Endurecimiento de 4 debilidades de la revisión (B-31 a B-34) + escape de comodines LIKE; pgTAP 60 ficheros / 1.652, E2E 108 ✔: W1 redacción de datos de auditoría también en BD (hoy solo en la API); W2 el tiempo máximo de `global_search` no se aplica; W3 `RAISE WARNING` filtra `SQLERRM` como aviso del protocolo; W4 un factor MFA configurado no se exige si `requires_mfa=false`
- [ ] Pendiente (F2.7): las funciones CRUD dejan pasar la escritura si falla la auditoría (fallo en abierto, heredado); `grant/revoke_admin_access` devuelven `SQLERRM` en su resultado jsonb
- [ ] Pendiente (F2.6): borrar a un miembro del personal borra la atribución de sus entradas de auditoría (`ON DELETE SET NULL` heredado) → decidir en F2.7a; la búsqueda global falla entera si los metadatos de una columna están desfasados; sin buscador en la navegación móvil; filtros de fecha solo en UTC
- [x] F2.6b · Contenido y demo (ADR-017): blog en la BD (`19-blog.sql`) gestionado desde el CMS y rutas `/blog` y `/blog/$slug` con Markdown seguro; esquema `demo` de pyme (seed); formatos legibles (incluida la relación virtual de membresías con cuentas); tablas bajo «Recursos» en la barra lateral. `/rls-review`: AISLADO. pgTAP 62 / 1.730, E2E 129
- [ ] Pendiente (F2.6b): un formato de visualización con una columna inexistente muestra ids; un texto con forma de fecha ISO se filtra como fecha
- [x] F2.7a · Ajustes: General (preferencias y zona horaria), Autenticación (MFA obligatorio; solo Root con aal2 puede desactivarlo) y Miembros (roles, activar/desactivar, auditoría). Paquete `@pymekit/cms-settings-ui`. Autor de la auditoría conservado al borrar (ADR-018), auditoría obligatoria en las escrituras, reglas de rango y cuentas raíz protegidas (B-41 a B-44). pgTAP 1.794, E2E 141
- [x] F2.7a · `/rls-review`: AISLADO; +68 pruebas (`cms-members-isolation.test.sql`), pgTAP 64 ficheros / 1.862
- [x] F2.7a · Debilidad hallada en la revisión (B-45): `cms._delete_record_impl` era ejecutable por `authenticated` → `delete_record` pasa a SECURITY DEFINER y se revoca la función interna; pgTAP 65 ficheros / 1.868, E2E del CMS 88 ✔
- [ ] Pendiente (F2.7a): `update/delete_record_by_conditions` pueden tocar hasta 25 filas con una sola entrada de auditoría (no alcanzable por la API, B-19); un miembro puede editar su nombre visible en `metadata`; `assigned_by` solo en asignaciones nuevas; el E2E del MFA lo desactiva globalmente unos segundos durante la suite
- [x] F2.7b · Ajustes: RBAC (roles, grupos y permisos) con rutas de servidor reescritas; objetos raíz inmutables; pendientes de ADR-015 cerrados (oráculos sí/no, vistas compartidas, almacenamiento en cerrado). `/rls-review`: brecha heredada de escape de denegaciones por delegación, corregida (B-47). pgTAP 67 ficheros / 2.049, E2E CMS+admin 100 ✔
- [ ] Pendiente (F2.7b): una denegación de almacenamiento sobre una subruta no bloquea el acceso por un permiso más amplio (heredado); C4/C5/C6/C8 aceptados (pares del mismo rango pueden alterar grupos compartidos sin superar sus propias capacidades)
- [x] F2.7c · Ajustes > Recursos: tablas por esquema (visibilidad, orden, sincronizar), configuración de tabla y columnas, secciones de relaciones y diseñador de fichas (arrastrar y soltar nativo). Rutas heredadas endurecidas (Zod estricto, esquemas protegidos, códigos estables; una escritura bloqueada por RLS devolvía «éxito», B-49). Sin cambios SQL. E2E afectados 50 ✔
- [ ] Pendiente (F2.7c): interfaz para relaciones virtuales; ajustes por tipo de formateador (moneda, fichero); el bloqueo de sincronizar esquemas protegidos solo está en la API (el seed registra `auth.users` con la misma función)
- [x] F2.8 · Paneles (RF-11): listado (míos/compartidos, crear, compartir, borrar) y panel con widgets de métrica, gráfica y tabla en cuadrícula propia (ADR-019); cada widget consulta con los permisos de quien lo ve; `WITH CHECK` en widgets y `UPDATE` por columnas en paneles (B-50). Paquete `@pymekit/cms-dashboards-ui`. pgTAP 2.060, E2E de paneles 13 ✔
- [ ] Pendiente (F2.8): `list_dashboards` devuelve un total incorrecto (heredado)
- [x] F2.9 · Cierre: suite E2E completa (149: 146 ✔ + 2 inestables conocidos + 1 test desactualizado por el permiso `resourceSettings` de la F2.7c, corregido y verificado en serie), skills `react-form-builder`, `service-builder` y `playwright-e2e` reescritas para el CMS integrado, pull request de `fase-2/cms` a `main`

## F3 · Desmarcado e i18n
- [ ] La caja de introducción del código MFA (`/auth/verify`) se ve descuadrada (detectado por el autor, 2026-10-02)
- [ ] Sesión anterior a un reinicio de la BD (refresh token inexistente): el dashboard de plataforma rompe con un error vacío en lugar de redirigir al login; endurecer el manejo de sesión caducada (detectado por el autor, 2026-10-02)
- [x] Renombrar el esquema de helpers pgTAP (`makerkit.*` → `pymekit.*`) también en los tests del CMS (adelantado a F2, B-40)
- [x] `check-branding` a cero (contenido y rutas), bloqueante en la CI (adelantado a F2 a petición del autor)
- [ ] Locale `es` por defecto (web, emails, CMS)
- [ ] Plantillas y `config.toml` de Supabase: marca hecha; falta traducir al español
- [x] Marca visual: logo propio (símbolo + nombre en texto), favicons generados a partir del símbolo y capturas de la landing tomadas de la propia app (`apps/e2e/scripts/capture-marketing-screenshots.mjs`, a regenerar tras la traducción) (B-46)
- [ ] La gráfica de demostración del panel muestra «Invalid Date» en su *tooltip* (heredado)
- [x] Helpers pgTAP `pymekit.*` (adelantado a F2)
- [x] Carpeta `packages/ui/src/makerkit/` → `src/pymekit/` (y sus exports) y `styles/makerkit.css` → `pymekit.css` (adelantado a F2 a petición del autor, B-40)
- [x] Contenido: emails de prueba → `@pymekit.test`, equipo de prueba → «PymeKit» (`pymekit`), comentarios SQL, `.env`, manifest, landing, `config.toml`, plantillas de email, READMEs y *tooling* (eliminado `version.mjs`, que se comparaba con el repositorio original)
- [ ] Plantillas de email solo tienen locale `en`: añadir `es`; revisar `EMAIL_TEMPLATE_RENDERERS` (no tiene consumidores)

## F4 · Comentarios en español
| Módulo | Estado | Revisado |
|---|---|---|
| `apps/web/supabase` (incluidas 5 funciones del CMS cuya única deriva frente a las migraciones son los comentarios: al reescribirlos hay que redefinirlas en una migración) | ⬜ | ⬜ |
| `packages/function-middleware`, `supabase`, `policies` | ⬜ | ⬜ |
| `packages/features/*` | ⬜ | ⬜ |
| `packages/billing/*` | ⬜ | ⬜ |
| `apps/web/src` | ⬜ | ⬜ |
| `packages/cms/*`, `apps/web/src/routes/{admin,api}/cms` (incluye quitar 27 `console.*` heredados y arreglar los tipos de los tests heredados, hoy excluidos del typecheck) | ⬜ | ⬜ |
| Resto de `packages/*` | ⬜ | ⬜ |
| `apps/e2e`, `tooling` | ⬜ | ⬜ |

## F5 · Adaptación a pymes
- [ ] Roles y permisos (ADR + pgTAP)
- [ ] Planes de Stripe (ADR)
- [ ] Plantilla de permisos del CMS
- [ ] Configuración reutilizable documentada
- [ ] Generadores revisados

## F6 · Validación
- [ ] E2E de CU-01 a CU-06
- [ ] pgTAP de aislamiento
- [ ] Integración con Stripe
- [ ] Evaluación de la reutilización (CU-07)
- [ ] Resultados documentados

## F7 · Despliegue
- [ ] Dockerfiles + docker-compose
- [ ] Railway + Supabase en la nube
- [ ] Manual de instalación probado

## F8 · Memoria
- [ ] Capítulos 1–9 (borradores)
- [ ] Anexos: manuales
- [ ] Revisión final con el tutor

---

## Dedicación

Sirve para el capítulo de *Planificación* (temporización y costes: horas reales frente a estimadas).

Se distinguen dos medidas:
- **Horas del autor**: dedicación real declarada por el autor. Es la que cuenta para la planificación y los costes.
- **Tiempo de reloj (≈)**: se estima con la hora de los commits (desde el primer mensaje de la sesión hasta el último commit de cada tramo). Incluye periodos en los que los agentes trabajan solos mientras el autor no está dedicado a la tarea, así que es una cota superior. La diferencia entre ambas medidas sirve de dato para analizar el efecto de trabajar asistido por agentes (capítulo de Planificación y Conclusiones).

| Fecha | Tramo | Fases | Horas | Fuente |
|---|---|---|---|---|
| 2026-09-29 | 11:15–11:58 | F0 (harness y plan) | ≈ 0,75 | commits |
| 2026-09-29 | 11:58–12:35 | F1 (base SaaS, Docker, CI) | ≈ 0,75 | commits |
| 2026-09-29 | 12:35–14:19 | F2 (análisis del CMS, decisión P-07) + F2.1 (BD y `/rls-review`) | ≈ 1,75 | commits |
| 2026-09-29 | 14:19–15:05 | F2.2 (API del CMS) | ≈ 0,75 | commits |
| 2026-09-29 | 15:05–15:50 | F2.3 (base de la interfaz) | ≈ 0,75 | commits |
| 2026-09-29 | 15:50–17:02 | Corrección MFA `/admin` + F2.4a (listado) | ≈ 1,25 | commits |
| 2026-09-29 | 17:02–17:50 | F2.4b (ficha de registro) + bitácora y trazabilidad | ≈ 0,75 | commits |
| 2026-09-29 | 17:50–19:00 | F2.4c (escritura) + borradores de la memoria | ≈ 1,25 | estimación (sin commit intermedio) |
| **Total 2026-09-29** | | | **≈ 8,0 de reloj** | commits |
| **Horas del autor 2026-09-29** | | | **8,0** | confirmado por el autor el 2026-09-30 |

| Fecha | Horas del autor | Tiempo de reloj (≈) | Fases trabajadas | Fuente |
|---|---|---|---|---|
| 2026-09-29 | 8,0 | ≈ 8,0 | F0, F1, F2.1–F2.4c, bitácora y borradores de la memoria | autor (confirma la estimación) |
| 2026-09-30 | 9,0 | — | F2.5, F2.6, F2.6b, F2.7a, F2.7b, limpieza de la marca (F3 adelantada) e identidad visual | autor |
| **Total** | **17,0** | | | |

## Registro de sesiones
| Fecha | Fase | Resumen |
|---|---|---|
| 2026-09-29 | F0 | Creado el harness: directrices, plan, requisitos, guías, skills, agentes, hooks, scripts y CI |
| 2026-09-29 | F0 | La memoria no nombrará las referencias (ADR-007). Remoto configurado. F0 cerrada; se pasa a F1 |
| 2026-10-02 | F2.9 | Cierre de la F2: E2E completa, skills al día y pull request a `main`. Siguiente: F3 (español) |
| 2026-10-02 | F2.8 | Paneles del CMS (modo ahorro); corregidos los widgets que podían apuntar a tablas no legibles y la apropiación de paneles compartidos (B-50) |
| 2026-10-02 | F2.7c | Recursos y diseñador de fichas del CMS (modo ahorro: un agente, E2E acotados) |
| 2026-09-30 | F2.7b | RBAC del CMS; brecha heredada de escape de denegaciones corregida (B-47). Se pausa el trabajo a petición del autor por el consumo de tokens: se seguirá en modo ahorro (B-48) |
| 2026-09-30 | F2.7a | Corregida inyección SQL latente en el borrado del CMS, introducida en la F2.1 al portar (B-45) |
| 2026-09-30 | F2.7a | Ajustes del CMS (General, Autenticación, Miembros), autor de auditoría conservado (ADR-018), auditoría obligatoria y reglas de rango; `/rls-review` AISLADO; pgTAP 1.862, E2E 141 |
| 2026-09-30 | F3 (adelantada) | Limpieza completa de la marca a petición del autor: `check-branding` a cero y bloqueante en la CI; pgTAP 1.730 y E2E 126 en verde |
| 2026-09-30 | F2 | El autor detecta rutas con la marca (`packages/ui/src/makerkit/`): renombradas `src/pymekit/`, `pymekit.css` y los helpers pgTAP `pymekit.*`; `check-branding` revisa ya las rutas y lo hace de forma bloqueante (B-40) |
| 2026-09-30 | F2.6b | Blog gestionado desde el CMS y visible en la web, demo de pyme, textos legibles en relaciones y tablas en la barra lateral; superficie de `anon` auditada (AISLADO) |
| 2026-09-30 | F2.6 | Endurecimiento tras `/rls-review`: redacción de la auditoría en BD, tiempo máximo de la búsqueda, sin `SQLERRM` en avisos y MFA exigido a quien lo tiene configurado (B-31 a B-35) |
| 2026-09-30 | F2.6 | Auditoría del CMS y búsqueda global; auditoría no falsificable, lectura redactada por permisos y búsqueda endurecida (B-27, B-28) |
| 2026-09-30 | F2.5 | Exploradores de usuarios y almacenamiento del CMS; corregidos fallos heredados de autorización, almacenamiento e inyección SQL (B-21 a B-25); E2E 102 |
| 2026-09-29 | F2.4c | Escritura en el explorador de datos (crear, editar, borrar, lote, en línea, relaciones); fallo de edición/borrado masivo y `not_nullviolation` corregidos; primeros borradores de la memoria (caps. 2, 4 y 5) |
| 2026-09-29 | F2.4b | Ficha de registro del CMS con relaciones y enlaces según permisos; E2E 76 ✔. Bitácora de incidencias y trazabilidad al día |
| 2026-09-29 | F2.4a | Listado del explorador de datos del CMS (filtros, orden, búsqueda, columnas y vistas guardadas); E2E 69 ✔ |
| 2026-09-29 | F2.3 | Corrección de seguridad (detectada por el autor): `/admin` se cargaba con sesión aal1; ahora exige aal2 (verificación MFA o 404). Test E2E de regresión añadido |
| 2026-09-29 | F2.3 | Base de la interfaz del CMS en `/admin/cms`: acceso de super-admin y personal, barra lateral por permisos y aviso de MFA; E2E 60 ✔ |
| 2026-09-29 | F2.2 | API del CMS montada en `/api/cms` dentro de la web: 19 paquetes de servidor, auth con la sesión de PymeKit y comprobación en BD; E2E 51 ✔ (1 flaky conocido) |
| 2026-09-29 | F2.1 | BD del CMS integrada y endurecida: 2 brechas heredadas (escalada RBAC, lectura de pg_authid) y el MFA que fallaba en abierto, corregidos (ADR-015); 1.550 pgTAP en verde |
| 2026-09-29 | F2 | P-07 decidido: integración total del CMS en `/admin/cms` (ADR-011), esquema `cms` (ADR-012), librerías unificadas (ADR-013) y super-admin como raíz del CMS (ADR-014) |
| 2026-09-29 | F2 | Detectado Supabase local expuesto a Internet (Docker se salta UFW): parado, regla DOCKER-USER persistente y volúmenes recreados (ADR-010). Inicio del análisis de P-07 |
| 2026-09-29 | F1 | Docker operativo: Supabase local, pgTAP (396 ✔) y E2E (43 ✔, 1 flaky). Web movida al 3100 (ADR-009) |
| 2026-09-29 | F1 | Base SaaS importada en la rama `fase-1/base`: scope `@pymekit/*`, retirados blog/changelog/CMS de contenidos/MCP/licencia; typecheck, lint, unit y build en verde. Pendiente Docker para Supabase |
