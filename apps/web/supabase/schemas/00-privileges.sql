/*
 * -------------------------------------------------------
 * Section: Revoke default privileges from public schema
 * We will revoke all default privileges from public schema on functions to prevent public access to them
 * -------------------------------------------------------
 */

-- Create a private PymeKit schema
create schema if not exists kit;

create extension if not exists "unaccent" schema kit;

-- We remove all default privileges from public schema on functions to
--   prevent public access to them
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

-- NOTE: the two statements below only affect tables that exist when they run.
-- This file is loaded first, so they are no-ops for every kit table. They are
-- kept for the storage schema (whose tables Supabase creates before this runs)
-- and are superseded for public by the default privileges further down.
revoke all PRIVILEGES on all TABLES in schema "public"
from
  "anon";

revoke all PRIVILEGES on all TABLES in schema "storage"
from
  "anon";

/*
 * Strip Supabase's default privileges for public.
 *
 * Their defaults grant REFERENCES, TRIGGER, TRUNCATE and (PG17+) MAINTAIN on
 * every new table to anon, authenticated and service_role, plus UPDATE on every
 * new sequence. RLS and the absent DML privileges hide them, but TRUNCATE
 * bypasses RLS and sequence UPDATE permits setval().
 *
 * Unlike the revokes above, this is order-independent: it applies to every table
 * created after it, here and in later migrations. Costs nothing -- the defaults
 * already withhold DML, so tables have always needed explicit grants.
 *
 * Scope: objects created by `postgres` (CLI migrations, dashboard SQL editor,
 * pg_meta). Supabase's separate supabase_admin-owned defaults still grant full
 * arwdDxtm and cannot be altered by `postgres` on hosted projects, so tables
 * created by extensions need their own explicit revoke.
 */
alter default privileges in schema public
revoke all on tables
from
  anon,
  authenticated,
  service_role;

-- A serial/bigserial column needs USAGE on its sequence for nextval(); grant it
-- explicitly next to the table grants. Identity columns need no sequence
-- privilege at all and are preferred -- see supabase/AGENTS.md.
alter default privileges in schema public
revoke all on sequences
from
  anon,
  authenticated,
  service_role;

-- We remove all default privileges from public schema on functions to
--   prevent public access to them by default
alter default privileges in schema public
revoke
execute on functions
from
  anon,
  authenticated;

-- we allow the authenticated role to execute functions in the public schema
grant usage on schema public to authenticated;

-- we allow the service_role role to execute functions in the public schema
grant usage on schema public to service_role;
