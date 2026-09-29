/*
 * Residual privilege hardening.
 *
 * Supabase's default privileges grant REFERENCES, TRIGGER, TRUNCATE and (PG17+)
 * MAINTAIN on every new table in public to anon, authenticated and service_role,
 * plus UPDATE on every new sequence. RLS and the absent DML privileges mask them,
 * but TRUNCATE bypasses RLS and sequence UPDATE permits setval().
 *
 * The base migration's `revoke all on all tables in schema public from anon` sits
 * above the first create table, and REVOKE ... ON ALL TABLES only covers tables
 * that already exist. So it never applied to the kit's tables, and cannot reach
 * tables added later -- public.nonces, or anything a downstream project adds.
 *
 * Scope: this covers objects created by `postgres`, which is every path a project
 * actually uses -- CLI migrations, the dashboard SQL editor and pg_meta. Supabase
 * keeps a second default-privileges entry owned by `supabase_admin` that still
 * grants full arwdDxtm, and `postgres` is not superuser on hosted projects so it
 * cannot alter it. Tables created by extensions (the standard example being
 * PostGIS's public.spatial_ref_sys) are therefore out of reach here and need
 * their own explicit revoke.
 */
-- Future objects. Costs nothing: the defaults already withhold DML, so every
-- table has always needed explicit grants to be usable.
alter default privileges in schema public
revoke all on tables
from
  anon,
  authenticated,
  service_role;

-- Sequences get no implicit grant either. A serial/bigserial column needs USAGE
-- on its sequence for nextval(); grant it explicitly alongside the table grants.
-- Identity columns (`generated always as identity`) need no sequence privilege
-- at all and are the better default -- see supabase/AGENTS.md.
alter default privileges in schema public
revoke all on sequences
from
  anon,
  authenticated,
  service_role;

/*
 * Existing objects.
 *
 * Only the non-DML bits are stripped: any SELECT/INSERT/UPDATE/DELETE currently
 * held was granted deliberately, and a blanket revoke would break a downstream
 * table that is meant to be readable. A project that has deliberately granted
 * TRUNCATE/REFERENCES/TRIGGER to an API role will lose it and must re-grant.
 *
 * service_role is included. It is tempting to skip it because it holds BYPASSRLS
 * and can usually empty a table with DELETE anyway -- but that is false exactly
 * where it matters: public.nonces is RPC-only, so service_role holds Dxtm and
 * nothing else, making TRUNCATE the only write it can perform there.
 *
 * MAINTAIN is PG17+; naming it unconditionally breaks PG15/16 projects.
 */
do $$
declare
  v_maintain text := case
    when current_setting('server_version_num')::int >= 170000 then ', maintain'
    else ''
  end;
begin
  execute 'revoke truncate, references, trigger' || v_maintain
    || ' on all tables in schema public from anon, authenticated, service_role';
end
$$;

/*
 * Existing sequences lose UPDATE (nextval + setval) and get USAGE (nextval only)
 * back only where the role actually needs it:
 *
 *   serial     -- only if the role can INSERT into the owning table
 *   identity   -- never; identity columns need no privilege on their sequence
 *   standalone -- preserve what the role could already do, since a project may
 *                 call nextval() on it directly (never for anon)
 *
 * Looping rather than `on all sequences` keeps this from re-granting USAGE on a
 * sequence a project has deliberately locked down. UPDATE held via a grant to
 * PUBLIC, or granted by another role, is not removable here.
 */
do $$
declare
  r record;
  v_deptype "char";
  v_owner oid;
  v_needs_usage boolean;
begin
  for r in
    select c.oid as seq_oid, c.oid::regclass::text as seq, g.role
    from pg_class c
    cross join (values ('anon'), ('authenticated'), ('service_role')) as g (role)
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'S'
      and has_sequence_privilege(g.role, c.oid, 'UPDATE')
  loop
    select d.deptype, d.refobjid
      into v_deptype, v_owner
    from pg_depend d
    where d.objid = r.seq_oid
      and d.classid = 'pg_class'::regclass
      and d.deptype in ('a', 'i')
    limit 1;

    v_needs_usage := case v_deptype
      when 'a' then has_table_privilege(r.role, v_owner, 'INSERT')
      when 'i' then false
      else r.role <> 'anon'
    end;

    execute format('revoke update on sequence %s from %I', r.seq, r.role);

    if v_needs_usage then
      execute format('grant usage on sequence %s to %I', r.seq, r.role);
    end if;
  end loop;
end
$$;

-- Mirrors the per-table revokes now carried in schemas/. The sweep above already
-- reaches these, but stating them keeps the migration and the declarative schema
-- readable side by side. nonces is RPC-only and gets nothing back.
revoke all on public.nonces
from
  anon,
  authenticated,
  service_role;
