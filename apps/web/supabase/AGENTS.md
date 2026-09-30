# Base de datos Supabase (`apps/web/supabase`)

Aquí viven los esquemas, las migraciones, el *seed* y las pruebas pgTAP de **toda** la base de datos de PymeKit.

## Organización de los esquemas

Los esquemas declarativos están en `schemas/`, con un prefijo numérico que fija el orden de dependencias (`00-privileges.sql` … `18-roles-seed.sql`). Hay que respetar ese orden al añadir ficheros nuevos.

- `00`–`18`: plataforma SaaS (esquema `public`).
- `19-blog.sql`: blog público gestionado desde el CMS (ADR-017). Es el único fichero que concede algo a `anon`: `usage` sobre `public` (tras retirarle cualquier privilegio residual) y lectura de lo publicado; `blog.test.sql` comprueba que no puede leer nada más.
- El esquema `demo` (datos de ejemplo de una pyme) solo existe en `seed.sql`, nunca en las migraciones. Los metadatos del CMS para las tablas de PymeKit (formatos de visualización, relación virtual de membresías) van en la migración `20260930140100_cms_display_formats.sql`; los de la demo, en el *seed*.
- `20`–`54`: CMS integrado (esquema `cms`, ADR-011 y ADR-012). La numeración es la del CMS original más 20, con el prefijo `cms-`. `53-cms-super-admin.sql` es el pegamento que convierte al super-admin de la plataforma en raíz del CMS (ADR-014). `54-cms-members-hardening.sql` (F2.7a) añade las cuentas raíz protegidas (`is_root_managed_account`) y la guardia de `requires_mfa`.
- Los tests del CMS se llaman `cms-*.test.sql` y usan los helpers de `00001-cms-test-helpers.sql` (esquema `cms_tests`). PymeKit exige MFA en el CMS por defecto: los tests funcionales lo desactivan explícitamente dentro de su transacción.

## Skills

Para implementar cambios en la base de datos:
- `/postgres-expert`: diseño de esquemas, RLS, migraciones y pruebas.

Tras cualquier cambio en RLS, `grant`, funciones `security definer`, vistas o esquemas de esta carpeta, durante la verificación se ejecuta la revisión adversarial de RLS:
- `/rls-review`: audita estáticamente los agujeros de aislamiento entre *tenants* y después los demuestra (o demuestra su ausencia) con pruebas pgTAP de ataque entre *tenants*.

## Flujo de migraciones

### Entidades nuevas

Primero el esquema declarativo y después se deja que `db:diff` escriba la migración, igual que al modificar algo existente. No se copia a mano el fichero de esquema en una migración: los dos acabarían divergiendo justo en los detalles que `db:diff` habría normalizado.

```bash
# 1. Escribir el fichero de esquema (ver «Plantilla de tabla»)
touch schemas/20-feature.sql

# 2. Generar la migración y limpiarla (ver «Cómo leer un diff generado»)
pnpm --filter web run supabase:db:diff -f feature_name

# 3. Aplicarla y generar los tipos
pnpm --filter web supabase migrations up
pnpm supabase:web:typegen

# 4. Comprobar que la migración reproduce el esquema: no debe
#    mencionar nada de la tabla nueva
pnpm --filter web run supabase:db:diff
```

### Modificar algo existente

```bash
# Editar el esquema y generar el diff
pnpm --filter web run supabase:db:diff -f update_feature

# Aplicar y regenerar los tipos
pnpm --filter web supabase migrations up
pnpm supabase:web:typegen
```

### Cómo leer un diff generado

`supabase:db:diff` construye una base de datos *shadow* a partir de los valores por defecto de Supabase, así que su salida nunca contiene solo tu cambio. Antes de hacer commit de una migración generada:

- **Escribe a mano el `revoke` y los `grant` por columna.** Para una tabla nueva, migra genera el `create table`, las restricciones y los `grant` de tabla completa, pero nunca el `revoke all ... from anon, authenticated, service_role` de cada tabla ni un `grant update (columnas)`. Cópialos del fichero de esquema, después del `create table`.
- **Un `revoke ... from "anon"` sobre una tabla que no has tocado es deriva local.** Los esquemas revocan el DML de `anon` tabla a tabla y `20260915100557_revoke_anon_dml.sql` alineó las migraciones, así que una base de datos limpia no genera ninguno. Resetea en lugar de incluirlos en el commit.
- **Las extensiones nunca van en `public`** (BITACORA B-39): `create extension ... schema extensions`. Los privilegios por defecto de `supabase_admin` conceden a `anon` todos los permisos sobre lo que crea en `public`, y desde ADR-017 `anon` tiene `usage` sobre ese esquema. `anon-surface.test.sql` falla si aparece en `public` un objeto cuyo propietario no sea `postgres`.
- **`anon` solo lee el blog** (ADR-017): cualquier tabla o función nueva en `public` debe revocar `anon` explícitamente y, si es pública, añadirse al conjunto permitido de `anon-surface.test.sql`.
- **`db diff` (migra) no genera ciertas propiedades de seguridad** (BITACORA B-35): la opción `security_invoker` de las vistas y los `grant`/`revoke` por columna. Escríbelas a mano en la migración y compruébalas con pgTAP (`reloptions` de la vista, `has_column_privilege`). Sin `security_invoker`, una vista se ejecuta con permisos del propietario e **ignora RLS**, y el diff posterior tampoco lo detecta.
- **Vuelve a ejecutar `supabase:db:diff` sin `-f` después de aplicar.** Un resultado limpio no menciona ninguna de tus tablas. Es la comprobación de que la migración y el esquema declarativo coinciden de verdad, y detecta la redundancia `unique`/`primary key` y otras divergencias silenciosas. (Los comentarios no entran en el diff, así que un `comment on` omitido no aparece aquí.)
- **Las migraciones no pueden ser destructivas.** Las bases de datos de producción son longevas y han pasado por todas las migraciones anteriores. Se modifica en el sitio (`create or replace function`, borrar y volver a crear una restricción con el mismo nombre); nunca se borra ni se reescribe una tabla.

### `migrations up` falla con `LegacyMigrationMissingLocalError`

La base de datos local tiene aplicada una migración que no está en `migrations/`, normalmente por un cambio de rama. Es deriva de la base de datos local, no de tu cambio. Se resetea en lugar de repararla:

```bash
pnpm supabase:web:reset   # vuelve a aplicar todas las migraciones y el seed
```

Esto borra los datos locales. Resetea siempre antes de fiarte de una ejecución pgTAP: la deriva local puede ocultar un `grant` que falta y que después hará fallar la CI.

## Reglas de seguridad

- **Activa SIEMPRE RLS** en las tablas nuevas.
- **NUNCA uses `security definer`** sin controles de acceso explícitos.
- Usa las funciones auxiliares existentes (ver la skill `/postgres-expert` y `packages/supabase/AGENTS.md`).
- **Concede solo los verbos que la funcionalidad usa.** Un `grant` es una capacidad real de PostgREST desde el momento en que se aplica, haya UI o no. Empieza por `select, insert`; añade `update`/`delete` en el mismo cambio que la funcionalidad que los necesita, condicionados a `public.has_permission(...)` como hacen `07-invitations.sql` y `17-storage.sql`. Ser miembro (`has_role_on_account`) no basta como autorización para escrituras destructivas.
- **Las FK `created_by`/`updated_by` hacia `auth.users` usan `on delete set null`.** Se aplica a cualquier fila que pueda sobrevivir al usuario, incluida la raíz del *tenant*, `accounts`. Con el NO ACTION por defecto, borrar a cualquier usuario que haya tocado una de esas filas falla, tanto para él (al borrar su cuenta) como para los administradores (al borrar el usuario). La transferencia de propiedad es la vía habitual por la que una fila acaba apuntando a un usuario que ya no es su propietario. Lo cubre `user-deletion-tracking.test.sql`; amplía esa prueba al añadir una tabla con columnas de trazabilidad.
- **NUNCA concedas `UPDATE` de tabla completa a `authenticated`.** Concede `UPDATE` por columnas, listando solo las que el usuario puede editar. Las columnas de identidad y de *tenancy* (`id`, `account_id` y cualquier FK que defina la propiedad) quedan fuera, para que un usuario no pueda mover una fila a otra cuenta con `UPDATE ... SET account_id = <otro tenant>`. El `WITH CHECK` de RLS no lo cubre limpiamente; los privilegios por columna lo rechazan de entrada.
  - Los privilegios por columna solo se comprueban contra la lista `SET` de la sentencia, así que los *triggers* `BEFORE` que escriben `updated_at` o columnas de trazabilidad o de sistema siguen funcionando aunque `authenticated` no tenga `UPDATE` sobre ellas. Además, el *trigger* de trazabilidad reafirma `created_by` en cada `UPDATE` ordinario y solo se aparta para la cascada `set null` desde `auth.users`, de modo que `created_by` es inmutable incluso en una tabla que conceda más de la cuenta.
  - `service_role` conserva el `UPDATE` de tabla completa para las columnas gestionadas por el sistema.
- **Revoca a los tres roles, `anon` incluido.** Los valores por defecto de Supabase conceden `REFERENCES`, `TRIGGER`, `TRUNCATE` y (desde PG17) `MAINTAIN` sobre cada tabla nueva a `anon`, `authenticated` y `service_role`, antes de que concedas nada y con RLS activo. `TRUNCATE` ignora RLS. `20260811000000_revoke_residual_privileges.sql` elimina esos valores por defecto, pero se mantiene el `revoke` por tabla como garantía local y legible.
  - Es invisible en las pruebas normales: el `SELECT` se deniega mientras el `TRUNCATE` funciona. Compruébalo en pgTAP; ver `privileges.test.sql` y `/rls-review`.
  - No asumas que el DML de `service_role` hace redundante su `TRUNCATE`. En una tabla solo accesible por RPC (`nonces`) no tiene ningún DML, así que `TRUNCATE` sería la única escritura que podría hacer.
  - `REVOKE ... ON ALL TABLES IN SCHEMA` solo afecta a las tablas que ya existen, así que nunca sustituye al `revoke` por tabla.
  - Los valores por defecto eliminados cubren los objetos creados por `postgres` (migraciones, *dashboard*, pg_meta). Los de `supabase_admin` siguen concediendo `arwdDxtm` completo y `postgres` no puede cambiarlos en la versión alojada, así que las tablas que crean las extensiones en `public` necesitan su propio `revoke` explícito.
- **Prefiere `generated always as identity` a `serial`/`bigserial`.** Las columnas *identity* no necesitan privilegios sobre su secuencia, así que no hay ACL de secuencia que configurar mal. Una columna `serial` necesita `usage` sobre su secuencia para `nextval()`, que ahora hay que conceder explícitamente junto a los `grant` de la tabla: `grant usage on sequence public.feature_id_seq to authenticated;`
  - Nunca concedas `update` sobre una secuencia a un rol de la API: permite `setval()`, que puede retroceder un contador y provocar colisiones de clave primaria. `usage` no lo permite.

## Plantilla de tabla

La tabla hija de *tenant* canónica completa. Cópiala en lugar de `03-accounts.sql`: `accounts` es la *raíz* del *tenant*, así que su `id` es también un id de usuario, sus políticas se basan en `primary_owner_user_id` y tiene un `unique` redundante sobre `id`.

```sql
create table if not exists public.feature (
  id uuid not null default extensions.uuid_generate_v4(),
  account_id uuid references public.accounts(id) on delete cascade not null,
  name varchar(255) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- `set null`, nunca el NO ACTION por defecto: la fila pertenece a la cuenta
  -- y sobrevive a quien la creó, así que no debe impedir borrar a ese usuario
  created_by uuid references auth.users on delete set null,
  updated_by uuid references auth.users on delete set null,
  primary key (id),
  constraint feature_name_not_blank check (length(trim(name)) > 0)
);

alter table "public"."feature" enable row level security;

-- anon también: los valores por defecto de Supabase le conceden TRUNCATE,
-- que ignora RLS
revoke all on public.feature from anon, authenticated, service_role;

-- service_role conserva el acceso completo (incluidas las columnas de sistema)
grant select, insert, update, delete on table public.feature to service_role;

-- authenticated recibe SOLO los verbos que la funcionalidad usa hoy. Ver
-- «Concede solo los verbos que la funcionalidad usa» antes de añadir update o delete
grant select, insert on table public.feature to authenticated;

create trigger feature_set_timestamps
  before insert or update on public.feature
  for each row execute function public.trigger_set_timestamps();

create trigger feature_set_user_tracking
  before insert or update on public.feature
  for each row execute function public.trigger_set_user_tracking();

-- Índice sobre la FK de tenancy en el orden en que la funcionalidad lee
create index if not exists ix_feature_account_id_created_at
  on public.feature (account_id, created_at desc);

-- Solo equipos: has_role_on_account() es falso para las cuentas personales
-- (no tienen membresías). Para admitirlas también, usa
-- `account_id = (select auth.uid()) or public.has_role_on_account(account_id)`.
create policy "feature_read" on public.feature for select
  to authenticated using (public.has_role_on_account(account_id));

create policy "feature_insert" on public.feature for insert
  to authenticated with check (public.has_role_on_account(account_id));

-- Igual que en 13-mfa.sql: sin esta política, una sesión sin elevar de un
-- usuario con MFA activado podría seguir accediendo a la tabla
create policy "restrict_mfa_feature" on public.feature
  as restrictive to authenticated using (public.is_mfa_compliant());
```

No añadas `unique` sobre `id` junto a `primary key (id)`. Es redundante y migra no genera esa restricción extra, así que la migración diverge del esquema en silencio.

## Pruebas pgTAP

Las pruebas están en `tests/database/*.test.sql`. El primer fichero (prefijo `00000-`) define el esquema de helpers `pymekit.*`, con funciones como `pymekit.authenticate_as(...)`, `pymekit.get_account_id_by_slug(...)` o `pymekit.set_identifier(...)` para simular usuarios y cuentas.

## Comandos

```bash
pnpm supabase:web:reset     # Resetear la base de datos
pnpm supabase:web:test      # Ejecutar las pruebas pgTAP (resetear antes, ver arriba)
pnpm supabase:web:typegen   # Generar los tipos de TypeScript
pnpm --filter web supabase migrations list  # Ver las migraciones
```
