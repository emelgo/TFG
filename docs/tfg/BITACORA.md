# Bitácora de incidencias y lecciones aprendidas

Registro de los problemas encontrados durante el desarrollo: qué pasó, por qué, cómo se resolvió y qué se aprendió. Es la fuente del apartado de dificultades y lecciones aprendidas de la memoria. Las incidencias de seguridad son, además, evidencia del valor del proceso de verificación del TFG (revisiones adversariales, tests de regresión).

Cada entrada se añade **en el momento** en que ocurre, no al final de la fase.

**Formato:**
- **Tipo:** seguridad · infraestructura · proceso · calidad · herramientas.
- **Origen:** heredado (venía del código de referencia) · propio (lo introdujimos nosotros) · entorno.
- **Evidencia:** commit, ADR, test o fichero que lo demuestra.

---

## Resumen

| ID | Fecha | Fase | Tipo | Origen | Título | Gravedad |
|---|---|---|---|---|---|---|
| B-01 | 2026-09-29 | F1 | calidad | propio | Renombrado del scope incompleto en una expresión regular | Media |
| B-02 | 2026-09-29 | F1 | infraestructura | entorno | Puerto 3000 ocupado en el equipo de desarrollo | Baja |
| B-03 | 2026-09-29 | F1 | herramientas | heredado | GitHub bloquea el push por «secretos» que son claves locales públicas | Baja |
| B-04 | 2026-09-29 | F2 | seguridad | entorno | Supabase local expuesto a Internet (Docker se salta UFW) | Alta |
| B-05 | 2026-09-29 | F2.1 | seguridad | heredado | Escalada de privilegios en el RBAC del CMS (UPDATE sin WITH CHECK) | Alta |
| B-06 | 2026-09-29 | F2.1 | seguridad | heredado | La comprobación de MFA del CMS fallaba en abierto | Alta |
| B-07 | 2026-09-29 | F2.1 | seguridad | heredado | Lectura de `auth.users` a través de `query_table` | Alta |
| B-08 | 2026-09-29 | F2.1 | seguridad | heredado | Lectura de `pg_catalog.pg_authid` (hashes de roles de Postgres) | Alta |
| B-09 | 2026-09-29 | F2.1 | seguridad | heredado | Política RLS con una condición tautológica | Baja |
| B-10 | 2026-09-29 | F2.1 | calidad | heredado | Esquema declarativo y migraciones del CMS desincronizados | Media |
| B-11 | 2026-09-29 | F2.1 | calidad | heredado | Un test heredado afirmaba el comportamiento inseguro | Media |
| B-12 | 2026-09-29 | F2.1 | proceso | herramientas | El agente de auditoría se detuvo al escribir pruebas de ataque | Baja |
| B-13 | 2026-09-29 | F2.2 | herramientas | heredado | El login de los E2E falla contra el servidor de desarrollo | Baja |
| B-14 | 2026-09-29 | F2.3 | seguridad | propio | La consola `/admin` se cargaba sin segundo factor | Media |
| B-15 | 2026-09-29 | F2.4a | proceso | entorno | Corte de conexión con un agente trabajando | Baja |
| B-16 | 2026-09-29 | F2.4a | calidad | propio | Dependencia circular entre paquetes del CMS | Baja |
| B-17 | 2026-09-29 | F2.4b | calidad | heredado | La API del CMS respondía 500 a registros inexistentes | Baja |
| B-18 | 2026-09-29 | F2.4c | calidad | heredado | Código de error inexistente (`not_nullviolation`) en `insert_record` | Baja |
| B-19 | 2026-09-29 | F2.4c | seguridad | heredado | Edición y borrado de varias filas con una «clave» que no era clave | Alta |
| B-20 | 2026-09-29 | F2.4c | seguridad | heredado | Mensajes internos de PostgreSQL devueltos al cliente | Media |

---

## B-01 · Renombrado del scope incompleto en una expresión regular
- **Qué pasó:** tras renombrar `@kit/` a `@pymekit/` en 352 ficheros con `sed`, `vite.config.ts` seguía con `/^@kit\//`. El scope estaba escrito escapado dentro de una expresión regular, y la sustitución literal no lo encontró.
- **Impacto:** la build compilaba, pero los paquetes del monorepo no se empaquetaban en el SSR (`noExternal`). Habría fallado en producción.
- **Solución:** corregir la expresión y ampliar `check-branding` para detectar también la forma escapada (`@kit\/`).
- **Evidencia:** `scripts/tfg/check-branding.mjs` (constante `SCOPE`); commit `bd26658`.
- **Lección:** un renombrado masivo con `sed` hay que verificarlo buscando variantes (escapadas, entre comillas o partidas), no solo la forma literal. Los controles automáticos deben cubrir esas variantes.

## B-02 · Puerto 3000 ocupado en el equipo de desarrollo
- **Qué pasó:** los E2E no podían arrancar la app porque otro servicio del servidor (Outline) ocupaba el puerto 3000.
- **Solución:** la web pasa al 3100 en todos los sitios que lo usan: Vite, Nitro, Supabase Auth, Playwright, Stripe y la CI (ADR-009).
- **Lección:** el puerto de una plataforma reutilizable debe ser configurable y estar documentado. Esto adelantó además el reparto de puertos previsto con el CMS.

## B-03 · GitHub bloquea el push por «secretos» que son claves locales públicas
- **Qué pasó:** la protección de secretos de GitHub rechazó el push de la F1 porque detectó una «Supabase Secret Key» en `.env.development`, `.env.test` y un test E2E.
- **Causa:** es la clave fija de Supabase CLI para desarrollo local. Es idéntica en cualquier instalación y solo es válida contra `127.0.0.1`.
- **Solución:** el autor la desbloqueó como «usada en tests».
- **Lección:** hay que distinguir los secretos reales de las credenciales públicas de desarrollo y documentarlo, porque las herramientas automáticas no lo distinguen.

## B-04 · Supabase local expuesto a Internet (Docker se salta UFW)
- **Qué pasó:** el entorno de desarrollo es un VPS con IP pública. Supabase local publica sus puertos (54321–54327) en `0.0.0.0`, y Docker inserta sus propias reglas de iptables, que se saltan el firewall UFW. La API y Postgres (`postgres/postgres`) fueron accesibles desde Internet durante aproximadamente una hora, solo con datos de prueba.
- **Cómo se detectó:** al investigar por qué el autor no veía `localhost:3100` desde su navegador, que resultó ser un servidor remoto.
- **Solución:**
  - parar Supabase;
  - añadir una regla persistente en la cadena `DOCKER-USER` (`/etc/ufw/after.rules`, con copia de seguridad);
  - recrear los volúmenes;
  - acceder a la app mediante un túnel SSH (ADR-010).
- **Lección:** en un servidor con IP pública, «local» no significa privado. Docker y UFW no se coordinan: hay que filtrar en `DOCKER-USER`. El manual de instalación (F7) debe advertirlo.

## B-05 · Escalada de privilegios en el RBAC del CMS (UPDATE sin WITH CHECK)
- **Qué pasó:** las políticas `UPDATE` de `cms.role_permissions`, `account_permissions` y `permission_group_permissions` solo tenían `USING`. Un administrador delegado con permiso para gestionar permisos podía cambiar `permission_id` y colgar de un rol inferior un permiso que él mismo no tenía.
- **Cómo se detectó:** en la revisión adversarial `/rls-review`, confirmada con una prueba ejecutada (`UPDATE 1`).
- **Solución:** `WITH CHECK` con `can_grant_permission` en las tres políticas (ADR-015).
- **Evidencia:** `cms-isolation.test.sql` (E1–E3); migración `20260929120700_cms_rls_hardening.sql`.
- **Lección:** en PostgreSQL, un `UPDATE` sin `WITH CHECK` valida la fila **antigua**, no la nueva. Cualquier comprobación que tenga el `INSERT` debe repetirse en el `WITH CHECK` del `UPDATE`.

## B-06 · La comprobación de MFA del CMS fallaba en abierto
- **Qué pasó:** `cms.verify_admin_access()` leía la opción `requires_mfa` con los permisos del usuario. Una política restrictiva ocultaba `cms.configuration` justo a quien tenía MFA configurado pero había entrado sin segundo factor. La función veía la opción vacía, la interpretaba como «MFA opcional» y dejaba pasar.
- **Cómo se detectó:** un test nuevo del pegamento super-admin (ADR-014) falló de forma inesperada. Al depurarlo con `psql` se reprodujo el caso.
- **Solución:** leer la opción con `cms.get_mfa_requirement()` (`security definer`) y tratar una opción ausente como «obligatorio» (ADR-015).
- **Evidencia:** `cms-super-admin-root.test.sql`; migración `20260929120600_cms_mfa_fail_closed.sql`.
- **Lección:** las comprobaciones de seguridad deben **fallar en cerrado**. Además, RLS puede ocultarle a una función de control los datos que necesita para decidir.

## B-07 · Lectura de `auth.users` a través de `query_table`
- **Qué pasó:** `cms.query_table` y `cms.get_record_by_keys` (`security definer` con RLS desactivado) no llamaban a `validate_schema_access`, y `query_table` tampoco a `verify_admin_access`. Con un permiso comodín, como el de Root, devolvían `auth.users` con los hashes de contraseña.
- **Solución:** las dos funciones exigen ahora ambas comprobaciones (ADR-015).
- **Evidencia:** `cms-isolation.test.sql` (A2–A5).
- **Lección:** toda función que se salta RLS debe aplicar el mismo conjunto de comprobaciones que sus funciones hermanas. Aquí las de escritura sí lo hacían y la de lectura no.

## B-08 · Lectura de `pg_catalog.pg_authid`
- **Qué pasó:** tras corregir B-07, un segundo agente independiente, encargado de **refutar** las conclusiones de la auditoría, encontró que la lista de esquemas protegidos no incluía `pg_catalog`. Root podía leer `pg_authid`, con los hashes SCRAM de los roles de Postgres.
- **Solución:** bloquear cualquier esquema `pg_*` (ADR-015).
- **Evidencia:** `cms-isolation.test.sql` (A6–A7); migración `20260929120800_cms_rls_hardening_2.sql`.
- **Lección:** una lista negra de esquemas es frágil; siempre falta alguno. Y la etapa de refutación independiente funciona: encontró algo que la primera auditoría dio por bueno.

## B-09 · Política RLS con una condición tautológica
- **Qué pasó:** en `view_role_permissions`, la condición `ar.role_id = role_id`, dentro de una subconsulta, resolvía `role_id` como `ar.role_id`. Comparaba la columna consigo misma, y cualquier usuario con un rol veía todas las asignaciones de permisos.
- **Solución:** cualificar la columna (`role_permissions.role_id`) y dar lectura completa solo a quien tiene `permission:select`.
- **Evidencia:** `cms-isolation.test.sql` (E4–E5).
- **Lección:** en subconsultas dentro de políticas RLS hay que cualificar siempre las columnas de la tabla protegida.

## B-10 · Esquema declarativo y migraciones del CMS desincronizados
- **Qué pasó:** `supabase db diff` mostró 9 funciones distintas entre los esquemas declarativos y lo que dejan las migraciones. En 4 la diferencia era de lógica (por ejemplo, `create_dashboard` solo comprobaba la cuenta en la versión de las migraciones).
- **Causa:** deriva ya presente en el repositorio original.
- **Solución:** alinear los esquemas con las migraciones, que son las que definen la BD real. Las 5 restantes solo difieren en comentarios y se resolverán en la F4.
- **Lección:** `db diff` debe formar parte de la verificación de cualquier cambio de BD, también al importar código ajeno.

## B-11 · Un test heredado afirmaba el comportamiento inseguro
- **Qué pasó:** tras corregir B-06, falló un test del CMS original. Su descripción decía «MFA required by default», pero su aserción comprobaba que se **concedía** el acceso.
- **Solución:** reescribir el test conforme a la política de PymeKit.
- **Lección:** un test en verde no prueba que el sistema sea correcto, solo que hace lo que el test dice. Hay que leer las aserciones, no solo los nombres.

## B-12 · El agente de auditoría se detuvo al escribir pruebas de ataque
- **Qué pasó:** el agente que ejecutaba `/rls-review` se detuvo a mitad de la tarea: un filtro de seguridad de la herramienta interpretó sus pruebas de explotación como sospechosas.
- **Solución:** terminar la tarea desde la sesión principal. Las pruebas de ataque se escribieron como tests pgTAP defensivos que demuestran que el ataque **falla**, y la etapa de refutación se encargó con un enfoque explícitamente defensivo.
- **Lección:** en tareas de seguridad asistidas por IA conviene formular las pruebas como verificación defensiva y dividir el trabajo en etapas.

## B-13 · El login de los E2E falla contra el servidor de desarrollo
- **Qué pasó:** el *setup* de autenticación de Playwright envía el formulario antes de que la página se hidrate cuando se ejecuta contra `pnpm dev`.
- **Solución provisional:** los E2E se lanzan siempre contra la build de test (`build:test` + `start:test`), igual que en la CI. Queda pendiente estabilizarlo.

## B-14 · La consola `/admin` se cargaba sin segundo factor
- **Qué pasó:** al abrir la consola al personal del CMS (ADR-016), el guard dejaba entrar a quien tuviera el claim `cms_access`. Ese claim lo tiene también un super-admin que solo ha introducido la contraseña. La API y la BD seguían exigiendo MFA, así que no se exponían datos, pero la consola se cargaba.
- **Cómo se detectó:** **prueba manual del autor**: iniciar sesión, no completar el MFA y escribir `/admin` en la URL.
- **Solución:** la consola exige siempre `aal2`. Con un factor configurado se redirige a la verificación (y se vuelve a la página tras verificar); sin factor, 404.
- **Evidencia:** commit `b5bcfbd`; test E2E «redirects to MFA verification and back to the console».
- **Lección:** los tests automáticos cubrieron los casos que se pensaron, no este. Las pruebas exploratorias manuales siguen siendo necesarias, y los guards de interfaz deben comprobar el nivel de la sesión, no solo sus claims.

## B-15 · Corte de conexión con un agente trabajando
- **Qué pasó:** se cortó la conexión con el servidor mientras un agente implementaba la F2.4a, y el trabajo quedó a medias sin commit. Al reconectar, git había perdido las credenciales de GitHub (estaban en caché).
- **Solución:**
  - apartar el trabajo a medias con `git stash`;
  - verificar y hacer commit por separado de la corrección de seguridad pendiente (B-14);
  - restaurar el trabajo y retomar el agente desde su transcripción;
  - configurar git para usar la sesión de `gh` (`gh auth setup-git`).
- **Lección:** cada incremento se cierra con su commit. Mezclar cambios de distinta naturaleza en el árbol de trabajo complica la recuperación.

## B-16 · Dependencia circular entre paquetes del CMS
- **Qué pasó:** al poner los componentes del explorador de datos en el mismo paquete que su API (`@pymekit/cms-data-explorer`), se formaba un ciclo con `@pymekit/cms-ui-core`, que importa los tipos de esa API. Turborepo lo rechaza.
- **Solución:** separar los componentes en un paquete cliente propio, `@pymekit/cms-data-explorer-ui`.
- **Lección:** en un monorepo, separar paquetes de servidor y de cliente no es solo una cuestión de seguridad: también evita ciclos de dependencias.

## B-17 · La API del CMS respondía 500 a registros inexistentes
- **Qué pasó:** al construir la ficha de registro, pedir un id inexistente, una clave con formato no válido o una columna que no existe devolvía un error 500 genérico. El cliente Drizzle envolvía el error de Postgres y perdía su código.
- **Solución:** el cliente Drizzle conserva el error original en `cause`. La ruta traduce los códigos SQLSTATE a respuestas HTTP correctas: `P0002` (sin fila), la clase `22` (dato no válido para el tipo) y `42703` (columna inexistente) dan 404; la falta de permiso o un esquema protegido dan 403.
- **Evidencia:** E2E de `cms-data-explorer-record.spec.ts` (id inexistente → página 404).
- **Lección:** envolver errores sin conservar la causa impide distinguir el «no existe» del «ha fallado», y eso empeora tanto la interfaz como la observabilidad.

## B-18 · Código de error inexistente (`not_nullviolation`) en `insert_record`
- **Qué pasó:** la función del CMS lanzaba la violación de NOT NULL con `ERRCODE = 'not_nullviolation'`, un nombre que PostgreSQL no reconoce (el correcto es `not_null_violation`). El resultado era un SQLSTATE 42704 en vez de 23502, y la API respondía 500 cuando faltaba un campo obligatorio.
- **Cómo se detectó:** al mapear los errores de escritura a códigos HTTP en la F2.4c. Se reprodujo con `psql`.
- **Solución:** corregir el nombre en el esquema declarativo y redefinir la función en la migración `20260929120900_cms_insert_not_null_errcode.sql`.
- **Evidencia:** `cms-isolation.test.sql` (A8).
- **Lección:** los nombres de condición de PL/pgSQL solo se validan al ejecutarse; un error tipográfico pasa desapercibido hasta que se da ese caso.

## B-19 · Edición y borrado de varias filas con una «clave» que no era clave
- **Qué pasó:** las rutas de edición y borrado del CMS aceptaban cualquier columna como condición para identificar «el registro». Con una URL manipulada (por ejemplo, `record/edit?type=info`) o llamando a la API, se podían modificar o borrar a la vez todas las filas que cumplieran la condición. La función SQL solo lo limitaba a 25 filas.
- **Cómo se detectó:** en la revisión de seguridad del propio diff de la F2.4c (enfoque de `/bug-hunt-lite`).
- **Solución:** `conditionsIdentifyOneRecord` (en `data-explorer-core`) exige la clave primaria o una restricción única completa, en la API (400) y en la interfaz.
- **Evidencia:** E2E «key guard» de `cms-data-explorer-write.spec.ts`.
- **Lección:** una operación pensada para «un registro» debe comprobar que la condición identifica **exactamente uno**; limitar el número de filas no es una protección.

## B-20 · Mensajes internos de PostgreSQL devueltos al cliente
- **Qué pasó:** el borrado en lote devolvía el texto `SQLERRM`, y otras rutas de escritura respondían 500 con mensajes parcialmente internos. Eso expone detalles del esquema, como nombres de restricciones y tablas.
- **Solución:** `classifyCrudError` traduce el SQLSTATE a 400/403/404/409 con un código estable (`RECORD_*`, definido en `@pymekit/cms-shared/error-codes`). El texto de PostgreSQL nunca llega al cliente, solo a los logs.
- **Lección:** los errores de la base de datos se clasifican en el servidor; al cliente solo le llegan códigos pensados para la interfaz.
