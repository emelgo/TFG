BEGIN;

select no_plan();

-- Regression: deleting a user must not be blocked by the created_by/updated_by
-- tracking columns on rows that outlive that user. Before this was fixed the
-- FKs were NO ACTION, and even with ON DELETE SET NULL the tracking trigger
-- re-asserted old.created_by on every UPDATE, undoing the cascade.
--
-- Shapes covered per table: created_by = doomed user with a living last editor,
-- both columns = doomed user, and updated_by only (so a regression on either FK
-- cannot hide behind the other's cascade). Rows are written with the doomed
-- user's JWT in the session; service_role is used where RLS would otherwise
-- stop the write, as a security-definer wrapper called on the user's behalf
-- would. A table built from the pre-4.1 template (table-level UPDATE, tracking
-- on insert or update) checks that created_by stays immutable for ordinary
-- updates while the cascade still goes through.

select tests.create_supabase_user('udt_owner', 'udt-owner@test.com');
select tests.create_supabase_user('udt_new_owner', 'udt-new-owner@test.com');
select tests.create_supabase_user('udt_member', 'udt-member@test.com');
select tests.create_supabase_user('udt_teammate', 'udt-teammate@test.com');
select tests.create_supabase_user('udt_teammate_two', 'udt-teammate-two@test.com');

-- Team Two is created with no JWT, so its created_by is null
set local role service_role;

select public.create_team_account('UDT Team Two', tests.get_supabase_uid('udt_owner'));

insert into public.accounts_memberships (account_id, user_id, account_role)
values
    (makerkit.get_account_id_by_slug('udt-team-two'), tests.get_supabase_uid('udt_new_owner'), 'owner'),
    (makerkit.get_account_id_by_slug('udt-team-two'), tests.get_supabase_uid('udt_member'), 'owner'),
    (makerkit.get_account_id_by_slug('udt-team-two'), tests.get_supabase_uid('udt_teammate_two'), 'member');

-- ---------------------------------------------------------------------------
-- accounts: udt_owner creates Team One (created_by), edits both teams
-- (updated_by), then transfers both away so the rows outlive them
-- ---------------------------------------------------------------------------
set local role postgres;
select makerkit.authenticate_as('udt_owner');
set local role service_role;

select public.create_team_account('UDT Team', tests.get_supabase_uid('udt_owner'));

insert into public.accounts_memberships (account_id, user_id, account_role)
values
    (makerkit.get_account_id_by_slug('udt-team'), tests.get_supabase_uid('udt_new_owner'), 'owner'),
    (makerkit.get_account_id_by_slug('udt-team'), tests.get_supabase_uid('udt_member'), 'owner');

set local role authenticated;

update public.accounts set picture_url = 'https://example.com/one.png'
where id = makerkit.get_account_id_by_slug('udt-team');

update public.accounts set picture_url = 'https://example.com/two.png'
where id = makerkit.get_account_id_by_slug('udt-team-two');

select row_eq(
    $$ select created_by, updated_by from public.accounts where slug = 'udt-team' $$,
    row (tests.get_supabase_uid('udt_owner'), tests.get_supabase_uid('udt_owner')),
    'team one: created_by and updated_by track the primary owner'
);

select row_eq(
    $$ select created_by, updated_by from public.accounts where slug = 'udt-team-two' $$,
    row (null::uuid, tests.get_supabase_uid('udt_owner')),
    'team two: only updated_by tracks the primary owner'
);

-- authenticated holds no UPDATE privilege on the tracking columns
select throws_ok(
    $$ update public.accounts set created_by = null where slug = 'udt-team' $$,
    '42501',
    'permission denied for table accounts',
    'authenticated cannot write accounts.created_by'
);

set local role service_role;

select public.transfer_team_account_ownership(
    makerkit.get_account_id_by_slug('udt-team'),
    tests.get_supabase_uid('udt_new_owner')
);

select public.transfer_team_account_ownership(
    makerkit.get_account_id_by_slug('udt-team-two'),
    tests.get_supabase_uid('udt_new_owner')
);

select row_eq(
    $$ select primary_owner_user_id, created_by, updated_by
       from public.accounts where slug = 'udt-team' $$,
    row (tests.get_supabase_uid('udt_new_owner'), tests.get_supabase_uid('udt_owner'), tests.get_supabase_uid('udt_owner')),
    'after the transfer the tracking columns still reference the former owner'
);

-- the new primary owner edits Team One, so its last editor is a living user
set local role postgres;
select makerkit.authenticate_as('udt_new_owner');

update public.accounts set picture_url = 'https://example.com/one-v2.png'
where id = makerkit.get_account_id_by_slug('udt-team');

select row_eq(
    $$ select created_by, updated_by from public.accounts where slug = 'udt-team' $$,
    row (tests.get_supabase_uid('udt_owner'), tests.get_supabase_uid('udt_new_owner')),
    'team one: created by the former owner, last edited by the new owner'
);

-- ---------------------------------------------------------------------------
-- accounts_memberships: udt_member adds a teammate to Team One (created_by +
-- updated_by) and changes the role of a teammate in Team Two (updated_by only)
-- ---------------------------------------------------------------------------
set local role postgres;
select makerkit.authenticate_as('udt_member');
set local role service_role;

insert into public.accounts_memberships (account_id, user_id, account_role)
values (makerkit.get_account_id_by_slug('udt-team'), tests.get_supabase_uid('udt_teammate'), 'member');

update public.accounts_memberships set account_role = 'owner'
where account_id = makerkit.get_account_id_by_slug('udt-team')
  and user_id = tests.get_supabase_uid('udt_teammate');

update public.accounts_memberships set account_role = 'owner'
where account_id = makerkit.get_account_id_by_slug('udt-team-two')
  and user_id = tests.get_supabase_uid('udt_teammate_two');

select row_eq(
    $$ select created_by, updated_by from public.accounts_memberships
       where account_id = makerkit.get_account_id_by_slug('udt-team')
         and user_id = tests.get_supabase_uid('udt_teammate') $$,
    row (tests.get_supabase_uid('udt_member'), tests.get_supabase_uid('udt_member')),
    'team one membership: created_by and updated_by track the managing member'
);

select row_eq(
    $$ select created_by, updated_by from public.accounts_memberships
       where account_id = makerkit.get_account_id_by_slug('udt-team-two')
         and user_id = tests.get_supabase_uid('udt_teammate_two') $$,
    row (null::uuid, tests.get_supabase_uid('udt_member')),
    'team two membership: only updated_by tracks the managing member'
);

-- the update guard still rejects re-parenting a membership
select throws_ok(
    $$ update public.accounts_memberships
       set account_id = tests.get_supabase_uid('udt_member')
       where account_id = makerkit.get_account_id_by_slug('udt-team')
         and user_id = tests.get_supabase_uid('udt_teammate') $$,
    'Membership identity columns cannot be updated',
    'membership identity columns are immutable'
);

-- ---------------------------------------------------------------------------
-- A table built from the pre-4.1 template: table-level UPDATE to authenticated
-- and tracking on insert or update. The trigger, not column grants, is what
-- keeps created_by immutable there, and that must survive the cascade fix.
-- ---------------------------------------------------------------------------
set local role postgres;

create table public.udt_legacy (
    id uuid primary key default gen_random_uuid(),
    account_id uuid references public.accounts (id) on delete cascade not null,
    name text not null,
    created_by uuid references auth.users on delete set null,
    updated_by uuid references auth.users on delete set null
);

alter table public.udt_legacy enable row level security;
grant select, insert, update on table public.udt_legacy to authenticated;

create policy udt_legacy_all on public.udt_legacy for all to authenticated
    using (public.has_role_on_account(account_id))
    with check (public.has_role_on_account(account_id));

create trigger udt_legacy_set_user_tracking
    before insert or update on public.udt_legacy
    for each row execute function public.trigger_set_user_tracking();

select makerkit.authenticate_as('udt_new_owner');

insert into public.udt_legacy (account_id, name)
values (makerkit.get_account_id_by_slug('udt-team'), 'owned by new owner');

set local role postgres;
select makerkit.authenticate_as('udt_member');

insert into public.udt_legacy (account_id, name)
values (makerkit.get_account_id_by_slug('udt-team'), 'owned by member');

-- a member with table-level UPDATE tries to take over attribution
update public.udt_legacy
set created_by = tests.get_supabase_uid('udt_member'), name = 'hijacked'
where name = 'owned by new owner';

select row_eq(
    $$ select name, created_by, updated_by from public.udt_legacy where name = 'hijacked' $$,
    row ('hijacked'::text, tests.get_supabase_uid('udt_new_owner'), tests.get_supabase_uid('udt_member')),
    'legacy table: the trigger reverts a created_by reassignment on an ordinary update'
);

-- the cascade pass-through only applies to the null the cascade sets: an update
-- issued from inside another trigger (same depth as the cascade) that nulls
-- updated_by and reassigns created_by in one statement still has created_by
-- reverted
set local role postgres;

create table public.udt_bump (id int primary key);

create function public.udt_bump_hijack() returns trigger language plpgsql
set search_path = '' as $$
begin
    update public.udt_legacy
    set updated_by = null,
        created_by = (select id from auth.users where email = 'udt-member@test.com')
    where name = 'hijacked';
    return new;
end $$;

create trigger udt_bump_hijack after insert on public.udt_bump
    for each row execute function public.udt_bump_hijack();

insert into public.udt_bump values (1);

select row_eq(
    $$ select created_by, updated_by from public.udt_legacy where name = 'hijacked' $$,
    row (tests.get_supabase_uid('udt_new_owner'), null::uuid),
    'legacy table: a trigger-issued update at cascade depth cannot reassign created_by'
);

-- ---------------------------------------------------------------------------
-- Delete the users the way auth.admin.deleteUser does (no JWT), and once with
-- the user's own JWT in the session, as a self-service delete RPC would run.
-- The uid lookup is a volatile function, so it is wrapped in a scalar subquery
-- to evaluate once; otherwise the DELETE re-runs it per scanned row and dies
-- once the row is gone.
-- ---------------------------------------------------------------------------
set local role postgres;
select set_config('request.jwt.claims', null, true);

select lives_ok(
    $$ delete from auth.users where id = (select tests.get_supabase_uid('udt_owner')) $$,
    'a former primary owner referenced by accounts tracking columns can be deleted'
);

select makerkit.authenticate_as('udt_member');
set local role postgres;

select lives_ok(
    $$ delete from auth.users where id = (select tests.get_supabase_uid('udt_member')) $$,
    'a member referenced by tracking columns can be deleted with their own JWT in the session'
);

select set_config('request.jwt.claims', null, true);

select results_eq(
    $$ select slug, primary_owner_user_id, created_by, updated_by
       from public.accounts where slug like 'udt-team%' order by slug $$,
    $$ values
         ('udt-team'::text, tests.get_supabase_uid('udt_new_owner'), null::uuid, tests.get_supabase_uid('udt_new_owner')),
         ('udt-team-two'::text, tests.get_supabase_uid('udt_new_owner'), null::uuid, null::uuid) $$,
    'both teams survive; the former owner is cleared and the living editor is kept'
);

select results_eq(
    $$ select account_role, created_by, updated_by
       from public.accounts_memberships
       where user_id in (tests.get_supabase_uid('udt_teammate'), tests.get_supabase_uid('udt_teammate_two')) $$,
    $$ values ('owner'::varchar, null::uuid, null::uuid), ('owner'::varchar, null::uuid, null::uuid) $$,
    'both teammate memberships survive with their tracking columns set to null'
);

select results_eq(
    $$ select name, created_by, updated_by from public.udt_legacy order by name $$,
    $$ values
         ('hijacked'::text, tests.get_supabase_uid('udt_new_owner'), null::uuid),
         ('owned by member'::text, null::uuid, null::uuid) $$,
    'legacy table rows survive; only the deleted user is cleared'
);

select is(
    (select count(*)::int from public.accounts_memberships
     where account_id in (makerkit.get_account_id_by_slug('udt-team'), makerkit.get_account_id_by_slug('udt-team-two'))),
    4,
    'the deleted users own membership rows cascaded away'
);

select * from finish();

ROLLBACK;
