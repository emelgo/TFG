/*
 * -------------------------------------------------------
 * Sección: Privilegios por defecto
 * Primer fichero del esquema declarativo. Antes de crear ninguna tabla,
 * retira los privilegios que PostgreSQL y Supabase conceden por defecto
 * (sobre todo al rol `anon`), para que cada objeto posterior parta de
 * "nadie puede nada" y tenga que conceder explícitamente lo que necesite.
 * Es la base del principio de mínimo privilegio de la plataforma.
 * -------------------------------------------------------
 */

-- Esquema privado `kit`: aloja funciones auxiliares y disparadores internos
-- que no deben exponerse a través de la API REST (PostgREST solo publica
-- `public`).
create schema if not exists kit;

create extension if not exists "unaccent" schema kit;

-- Ninguna función nueva será ejecutable por `public` (cualquier rol) salvo
-- que se le conceda `execute` de forma explícita.
alter default privileges
revoke
execute on functions
from
  public;

revoke all on schema public
from
  public;

revoke all PRIVILEGES on database "postgres"
from
  "anon";

revoke all PRIVILEGES on schema "public"
from
  "anon";

revoke all PRIVILEGES on schema "storage"
from
  "anon";

revoke all PRIVILEGES on all SEQUENCES in schema "public"
from
  "anon";

revoke all PRIVILEGES on all SEQUENCES in schema "storage"
from
  "anon";

revoke all PRIVILEGES on all FUNCTIONS in schema "public"
from
  "anon";

revoke all PRIVILEGES on all FUNCTIONS in schema "storage"
from
  "anon";

-- Nota: estas dos sentencias solo afectan a las tablas que ya existen al
-- ejecutarse. Como este fichero se carga el primero, no tienen efecto sobre
-- las tablas de PymeKit; se mantienen por el esquema `storage` (cuyas tablas
-- crea Supabase antes) y, para `public`, quedan sustituidas por los
-- privilegios por defecto que se definen más abajo.
revoke all PRIVILEGES on all TABLES in schema "public"
from
  "anon";

revoke all PRIVILEGES on all TABLES in schema "storage"
from
  "anon";

/*
 * Eliminación de los privilegios por defecto de Supabase en `public`.
 *
 * Por defecto Supabase concede REFERENCES, TRIGGER, TRUNCATE y (desde PG17)
 * MAINTAIN sobre cada tabla nueva a anon, authenticated y service_role, además
 * de UPDATE sobre cada secuencia nueva. La RLS y la ausencia de privilegios
 * DML los ocultan en la práctica, pero TRUNCATE se salta la RLS y el UPDATE
 * sobre una secuencia permite llamar a setval().
 *
 * A diferencia de los `revoke` anteriores, esto no depende del orden: se aplica
 * a toda tabla creada después, aquí o en migraciones posteriores. No cuesta
 * nada, porque los privilegios por defecto ya excluían el DML y las tablas
 * siempre han necesitado `grant` explícitos.
 *
 * Alcance: objetos creados por el rol `postgres` (migraciones de la CLI, editor
 * SQL del panel, pg_meta). Los privilegios por defecto propios de
 * `supabase_admin` siguen concediendo arwdDxtm y `postgres` no puede cambiarlos
 * en proyectos alojados, así que las tablas que creen las extensiones necesitan
 * su propio `revoke` explícito.
 */
alter default privileges in schema public
revoke all on tables
from
  anon,
  authenticated,
  service_role;

-- Una columna serial/bigserial necesita USAGE sobre su secuencia para llamar a
-- nextval(); en ese caso se concede explícitamente junto a los permisos de la
-- tabla. Las columnas identity no necesitan privilegios sobre secuencias y por
-- eso son las preferidas (ver supabase/AGENTS.md).
alter default privileges in schema public
revoke all on sequences
from
  anon,
  authenticated,
  service_role;

-- Ni anon ni authenticated pueden ejecutar por defecto las funciones nuevas de
-- `public`: cada función expuesta a la API debe recibir su `grant execute`
-- explícito, lo que obliga a decidir conscientemente qué se publica.
alter default privileges in schema public
revoke
execute on functions
from
  anon,
  authenticated;

-- Los usuarios autenticados necesitan USAGE sobre el esquema para poder
-- referirse a sus objetos; qué tablas y funciones usan lo deciden los `grant`
-- concretos y la RLS.
grant usage on schema public to authenticated;

-- Igual para service_role, el rol del cliente administrador del servidor.
grant usage on schema public to service_role;
