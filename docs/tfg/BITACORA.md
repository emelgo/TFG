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
| B-21 | 2026-09-30 | F2.5 | seguridad | heredado | La gestión de usuarios solo comprobaba el claim `cms_access` | Alta |
| B-22 | 2026-09-30 | F2.5 | calidad/seguridad | heredado | Permisos de almacenamiento: consulta que siempre fallaba y herencia de carpetas | Alta |
| B-23 | 2026-09-30 | F2.5 | seguridad | heredado | La comprobación de usuario bloqueado fallaba en abierto | Media |
| B-24 | 2026-09-30 | F2.5 | seguridad | heredado | Inyección SQL por sustitución manual de parámetros | Alta |
| B-25 | 2026-09-30 | F2.5 | seguridad | heredado | Subidas con tipo de contenido elegido por el cliente | Media |
| B-26 | 2026-09-30 | F2.5 | proceso | propio | Un E2E que cierra todas las sesiones rompía otros tests | Baja |
| B-27 | 2026-09-30 | F2.6 | seguridad | heredado | Entradas de auditoría falsificables por el personal | Alta |
| B-28 | 2026-09-30 | F2.6 | seguridad | heredado | La búsqueda global podía buscar en `auth.users` | Alta |
| B-29 | 2026-09-30 | F2.6 | calidad | heredado | Errores controlados convertidos en 500 por el envoltorio de transacciones | Baja |
| B-30 | 2026-09-30 | F2.6 | proceso | propio | La búsqueda global no estaba en el plan inicial | Baja |
| B-31 | 2026-09-30 | F2.6 | seguridad | heredado | La redacción de los datos de auditoría solo la hacía la API | Media |
| B-32 | 2026-09-30 | F2.6 | seguridad | heredado | El tiempo máximo de la búsqueda global no se aplicaba | Baja |
| B-33 | 2026-09-30 | F2.6 | seguridad | heredado | `RAISE WARNING` enviaba el texto de los errores al cliente | Baja |
| B-34 | 2026-09-30 | F2.6 | seguridad | heredado | Un factor MFA configurado no se exigía si el MFA era opcional | Baja |
| B-35 | 2026-09-30 | F2.6 | herramientas | entorno | `db diff` omite `security_invoker` y los permisos por columna | Media |

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

## B-21 · La gestión de usuarios solo comprobaba el claim `cms_access`
- **Qué pasó:** las rutas del explorador de usuarios usan el cliente administrador de Auth (clave de servicio), pero solo exigían el claim `cms_access`. Cualquier miembro del personal del CMS podía bloquear, borrar o restablecer la contraseña de un super-admin de la plataforma, de otro miembro de rango superior o de sí mismo.
- **Cómo se detectó:** en la auditoría de seguridad que se encargó junto con la F2.5, orientada a escalada de privilegios.
- **Solución:** cada acción exige el permiso RBAC concreto (`auth_user:update/delete/insert`) y comprueba el objetivo. No se puede actuar sobre uno mismo ni sobre un super-admin, y sobre el personal del CMS solo si se le supera en rango (`can_action_account`). Los esquemas de las peticiones son estrictos: `app_metadata` o `role` dan 400 y ningún endpoint escribe metadatos.
- **Evidencia:** `user-protection.test.ts`; E2E «nadie actúa sobre sí mismo…» y «ningún endpoint acepta app_metadata».
- **Lección:** cuando un servicio usa una credencial que se salta RLS, **toda** la autorización recae en el código que la llama, y hay que comprobar el objetivo de la acción, no solo al actor.

## B-22 · Permisos de almacenamiento: consulta que siempre fallaba y herencia de carpetas
- **Qué pasó:** la consulta de permisos en bloque de Storage pasaba un array que Drizzle expandía como `($1,$2)`, así que fallaba siempre. Todos los permisos por fichero salían falsos y borrar no funcionaba nunca. Además, los ficheros heredaban los permisos de su carpeta padre, lo que podía conceder de más.
- **Solución:** parámetro `jsonb` en la consulta y comprobación siempre sobre la ruta exacta.
- **Lección:** una comprobación de permisos que falla por error y «deniega» oculta el fallo; la funcionalidad parecía restringida cuando en realidad estaba rota.

## B-23 · La comprobación de usuario bloqueado fallaba en abierto
- **Qué pasó:** si la consulta del estado de bloqueo a Auth daba error, el middleware del CMS dejaba pasar la petición. Durante una caída momentánea de Auth, un usuario bloqueado con un JWT todavía vigente podía usar el CMS.
- **Cómo se detectó:** el agente de la F2.5 lo dejó anotado como pendiente y se corrigió en la revisión de su informe.
- **Solución:** se trata como bloqueado (fallo en cerrado).
- **Lección:** es el mismo principio que B-06. En una consola de administración, ante la duda, se deniega.

## B-24 · Inyección SQL por sustitución manual de parámetros
- **Qué pasó:** `checkBulkPermissions` construía la consulta con marcadores `$1`, `$2`… y después los **sustituía a mano** en el texto, escapando solo las comillas simples, antes de ejecutarla con `sql.raw`. Si un valor controlado por el cliente (por ejemplo, un nombre de tabla) contenía la cadena `$2`, la siguiente sustitución se insertaba dentro de su literal y rompía el entrecomillado, lo que permitía inyectar SQL.
- **Cómo se detectó:** en la revisión de la sesión principal sobre los pendientes del agente de la F2.5. El agente había señalado otro `sql.raw` sin uso, y al revisar el fichero apareció este segundo, que **sí se usa** en todas las comprobaciones de permisos del CMS. Ninguna de las revisiones automáticas anteriores lo había detectado.
- **Solución:** `buildParameterizedStatement` convierte cada `$n` en un parámetro enlazado de Drizzle, así que los valores no forman parte del texto SQL. Además se eliminó el método sin uso que también construía SQL con `sql.raw`.
- **Evidencia:** `build-parameterized-statement.test.ts`, que reproduce el valor malicioso; suite E2E completa en verde.
- **Lección:** escapar a mano nunca sustituye a los parámetros enlazados. Y ninguna revisión es exhaustiva: los agentes pasaron por este fichero varias veces sin verlo, así que conviene que una persona (o la sesión principal) revise los informes y los «pendientes» con ojo crítico.

## B-25 · Subidas con tipo de contenido elegido por el cliente
- **Qué pasó:** los ficheros se subían directamente desde el navegador con el tipo de contenido que indicaba el cliente. Un HTML disfrazado de PNG podía quedar almacenado como imagen o servirse de forma que el navegador lo interpretara. Los enlaces firmados duraban 1 h y todos los tipos tenían URL pública.
- **Solución:**
  - las subidas pasan por la API, con un límite de 5 MB;
  - un fichero se guarda como imagen solo si la extensión y los *magic bytes* coinciden, y si no como `application/octet-stream`;
  - la vista previa solo existe para imágenes (10 min) y las descargas son siempre adjuntos firmados de 60 s.
- **Evidencia:** E2E «HTML disfrazado de PNG».

## B-26 · Un E2E que cierra todas las sesiones rompía otros tests
- **Qué pasó:** el test heredado «delete user flow» hace un cierre de sesión global, que revoca la sesión compartida del super-admin. Los tests nuevos que leían al usuario con `getUser()` fallaban solo al ejecutar la suite completa. Además, Playwright no envía `Origin` en peticiones sin cuerpo o multipart, y el 403 en texto plano del CSRF hacía pasar por error algunas aserciones de 403.
- **Solución:** leer al actor del JWT verificado (como el middleware), añadir `Origin` en esas peticiones y comprobar también el `errorCode`, no solo el estado HTTP.
- **Lección:** los tests E2E comparten estado (sesiones); un 403 no demuestra nada si no se comprueba **por qué** se rechazó.

## B-27 · Entradas de auditoría falsificables por el personal
- **Qué pasó:** cualquier miembro del personal del CMS podía insertar filas en `cms.audit_logs`, incluso con el `user_id` de otro usuario, porque tenía `INSERT` sobre la tabla, una política de inserción y permiso para ejecutar `create_audit_log`. Un registro de auditoría que el auditado puede escribir no sirve como evidencia. Era el pendiente menor que ADR-015 había dejado anotado.
- **Solución:**
  - Se revoca el `INSERT`, se elimina la política de inserción y se revoca el `EXECUTE` de `create_audit_log`.
  - Las acciones del explorador de usuarios se auditan con la nueva función `security definer` `cms.log_auth_user_action`, que exige el permiso `auth_user` y siempre atribuye la entrada al propio actor.
  - La lectura de los datos (`old_data`, `new_data`, `record_id`) se redacta con `cms.can_read_audit_log_data`, salvo que el lector pueda consultar esa tabla.
- **Evidencia:** migración `20260930120000_cms_audit_logs_integrity.sql`; `cms-audit-logs-integrity.test.sql` (32 tests).
- **Riesgo residual documentado:** quien tenga el permiso `auth_user` puede llamar a `log_auth_user_action` directamente y registrar una acción que no hizo, siempre a su propio nombre. Solo es alcanzable con SQL directo, porque el esquema `cms` no se expone por PostgREST.
- **Lección:** el registro de auditoría solo lo deben escribir las funciones del sistema, nunca el usuario auditado.

## B-28 · La búsqueda global podía buscar en `auth.users`
- **Qué pasó:** `cms.global_search` no llamaba a `verify_admin_access` ni a `validate_schema_access`, así que `auth.users` era buscable. Además devolvía `SQLERRM` en bruto, no tenía límites de resultados, de tiempo ni de longitud de la consulta, leía las claves primarias del sitio equivocado y ordenaba los resultados después de un `LIMIT 5` por tabla.
- **Solución:**
  - la función queda endurecida (acceso, esquemas protegidos, parámetros enlazados, límites y tiempo máximo);
  - la API recorta cada resultado a título, tabla y claves.
- **Evidencia:** E2E `cms-global-search.spec.ts` (el personal de soporte no ve filas de tablas no permitidas).
- **Lección:** es la misma familia que B-07 y B-08. Todas las funciones que se saltan RLS deben compartir un único punto de control, en lugar de repetir la lista de comprobaciones en cada una.

## B-29 · Errores controlados convertidos en 500 por el envoltorio de transacciones
- **Qué pasó:** `runTransaction` envolvía todos los errores. Un 403 lanzado a propósito dentro de la transacción acababa como 500.
- **Solución:** desenvolver la causa antes de clasificar el error. Es la continuación de B-17.

## B-30 · La búsqueda global no estaba en el plan inicial
- **Qué pasó:** al comparar, a petición del autor, las secciones del CMS original con las portadas, apareció la búsqueda global, que no figuraba en el plan. Además, los Ajustes resultaron ser casi tan grandes como el explorador de datos.
- **Solución:** añadir la búsqueda a la F2.6, dividir la F2.7 en tres entregas y registrar ADR-017 (blog y demo, a raíz de la misma revisión).
- **Lección:** al portar un producto, el inventario de funcionalidades debe hacerse al principio **ruta a ruta**, no por paquetes.

## B-31 · La redacción de los datos de auditoría solo la hacía la API
- **Qué pasó:** tras B-27, la API ocultaba `old_data`, `new_data` y `record_id` de las entradas cuya tabla no podía leer el lector, pero la política de la tabla los devolvía sin redactar. No era explotable (el esquema `cms` no se expone por PostgREST), pero toda la protección dependía de una sola capa.
- **Cómo se detectó:** en `/rls-review` de la F2.6 (veredicto AISLADO, debilidad W1).
- **Solución:** `authenticated` pierde el permiso `SELECT` sobre esas tres columnas. Se leen a través de la vista `cms.audit_logs_readable` (`security_invoker`), que llama a la función `security definer` `cms.get_audit_log_row_data`: esta vuelve a comprobar el MFA y el rango y devuelve los datos a `NULL` si el lector no puede consultar esa tabla. La API lee la vista y mantiene su propia redacción como segunda capa.
- **Evidencia:** `cms-hardening-f26.test.sql`; comprobación manual de la sesión principal (el personal de soporte obtiene 0 filas de una entrada de Root por la función y por la vista; Root sí la ve).
- **Lección:** la defensa en profundidad exige que la base de datos aplique la regla, no solo la API.

## B-32 · El tiempo máximo de la búsqueda global no se aplicaba
- **Qué pasó:** `global_search` hacía `SET LOCAL statement_timeout` dentro de la propia sentencia en ejecución, lo que no reinicia el temporizador: una consulta lenta seguía corriendo. Además, en una rama de error dejaba el tiempo máximo de 1 s activo para el resto de la transacción de quien llamaba.
- **Solución:** la API fija el tiempo máximo (5 s) en su transacción antes de la consulta; la función ya no lo toca. De paso se escapan los comodines de `LIKE`, porque `'%%'` coincidía con todo.

## B-33 · `RAISE WARNING` enviaba el texto de los errores al cliente
- **Qué pasó:** varias funciones del CMS emitían `RAISE WARNING ... SQLERRM`, y los avisos viajan al cliente por el protocolo de PostgreSQL. El valor devuelto estaba limpio, pero el aviso llevaba el error interno.
- **Solución:** `RAISE LOG`, que solo queda en el log del servidor. Aplicado en `global_search`, `insert_record`, `_update_record_impl`, `_delete_record_impl` y `verify_admin_access`.

## B-34 · Un factor MFA configurado no se exigía si el MFA era opcional
- **Qué pasó:** con `requires_mfa = 'false'`, un usuario que sí tenía un factor verificado podía usar el CMS con sesión aal1 a través de las funciones `security definer`. Solo las políticas restrictivas de las tablas lo impedían.
- **Solución:** `verify_admin_access` exige además `cms.is_mfa_compliant()`: quien tiene MFA configurado debe usarlo siempre, sea cual sea la opción global.

## B-35 · `db diff` omite `security_invoker` y los permisos por columna
- **Qué pasó:** al generar la migración de B-31, `supabase db diff` (migra) no incluyó la opción `security_invoker` de la vista ni los `grant` por columna. Una migración generada automáticamente habría creado una vista con permisos del propietario, que **ignora RLS**, y el `db diff` posterior tampoco lo habría detectado.
- **Solución:** esa parte de la migración se escribe a mano, y pgTAP comprueba las dos propiedades. Queda anotado en `apps/web/supabase/AGENTS.md`.
- **Lección:** que `db diff` salga limpio no demuestra que la migración sea segura. Las propiedades de seguridad se verifican con tests, no con la herramienta de diferencias.
