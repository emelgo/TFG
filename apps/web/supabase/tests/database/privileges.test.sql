/*
 * Guards the residual-privilege hardening in
 * 20260811000000_revoke_residual_privileges.sql.
 *
 * Supabase's default privileges hand REFERENCES, TRIGGER, TRUNCATE and (PG17+)
 * MAINTAIN on every new table to anon, authenticated and service_role, plus
 * UPDATE on every new sequence. None of it shows up in ordinary testing --
 * SELECT is correctly denied while TRUNCATE succeeds -- so it has to be asserted
 * directly. `supabase db diff` can silently reintroduce these, which is what
 * these tests exist to catch.
 */
BEGIN;

select no_plan();

-- 1. No API role holds a residual privilege on any table in public.
select is_empty(
  $$
    select c.relname || ' / ' || r.role || ' / ' || p.priv
    from pg_class c
    cross join (values ('anon'), ('authenticated'), ('service_role')) as r (role)
    cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p (priv)
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p')
      and has_table_privilege(r.role, c.oid, p.priv)
  $$,
  'No API role should hold TRUNCATE/REFERENCES/TRIGGER on any table in public'
);

-- 2. No API role can setval() a sequence in public.
select is_empty(
  $$
    select c.relname || ' / ' || r.role
    from pg_class c
    cross join (values ('anon'), ('authenticated'), ('service_role')) as r (role)
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'S'
      and has_sequence_privilege(r.role, c.oid, 'UPDATE')
  $$,
  'No API role should hold UPDATE (setval) on a sequence in public'
);

-- 3. The default privileges themselves are stripped, so a table added by a later
--    migration starts clean rather than inheriting the residuals again.
select is_empty(
  $$
    select a.acl::text
    from pg_default_acl d
    cross join lateral unnest(d.defaclacl) as a (acl)
    where d.defaclnamespace = 'public'::regnamespace
      and pg_get_userbyid(d.defaclrole) = 'postgres'
      and d.defaclobjtype in ('r', 'S')
      and a.acl::text ~ '^(anon|authenticated|service_role)='
  $$,
  'Default privileges for public should grant nothing to the API roles'
);

-- 4. nonces is RPC-only: no API role holds any privilege on the base table.
--    service_role included -- it has no DML there, so TRUNCATE would be the only
--    write it could perform.
select is_empty(
  $$
    select r.role || ' / ' || p.priv
    from (values ('anon'), ('authenticated'), ('service_role')) as r (role)
    cross join (values
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
      ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) as p (priv)
    where has_table_privilege(r.role, 'public.nonces', p.priv)
  $$,
  'nonces is RPC-only: no API role should hold any privilege on the base table'
);

-- 5. Prove the denial behaviourally as a real authenticated user, not just from
--    the catalog -- this is the shape of the original report.
select makerkit.set_identifier('primary_owner', 'test@makerkit.dev');
select makerkit.authenticate_as('primary_owner');

select throws_ok(
  'truncate table public.nonces cascade',
  '42501',
  'permission denied for table nonces',
  'authenticated must not be able to TRUNCATE nonces'
);

select throws_ok(
  'truncate table public.accounts cascade',
  '42501',
  'permission denied for table accounts',
  'authenticated must not be able to TRUNCATE accounts'
);

select * from finish();

ROLLBACK;
