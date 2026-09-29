BEGIN;

select no_plan();

-- ----------------------------------------------------------------------------
-- Setup: an owner + member of a team account, plus a foreigner with no
-- membership. 'aa_owner' owns 'active-test', 'aa_member' is a plain member.
-- ----------------------------------------------------------------------------

select tests.create_supabase_user('aa_owner', 'aa_owner@test.com');
select tests.create_supabase_user('aa_member', 'aa_member@test.com');
select tests.create_supabase_user('aa_foreigner', 'aa_foreigner@test.com');

set local role service_role;

select public.create_team_account(
    'Active Test',
    tests.get_supabase_uid('aa_owner'),
    'active-test'
);

set local role postgres;

insert into public.accounts_memberships (account_id, user_id, account_role)
values
    (makerkit.get_account_id_by_slug('active-test'), tests.get_supabase_uid('aa_member'), 'member');

-- ----------------------------------------------------------------------------
-- Default resolution: no stored row resolves to the personal account
-- ----------------------------------------------------------------------------

select makerkit.authenticate_as('aa_owner');

select is(
  (select public.active_account_id()),
  tests.get_supabase_uid('aa_owner'),
  'active_account_id defaults to the personal account (id = user id)'
);

select row_eq(
  $$ select is_personal_account from public.active_account_workspace() $$,
  row(true),
  'active_account_workspace defaults to the personal account'
);

select is_empty(
  $$ select * from public.get_active_account_members() $$,
  'a personal active account has no members'
);

-- ----------------------------------------------------------------------------
-- Switching to a team the user belongs to
-- ----------------------------------------------------------------------------

select public.set_active_account(makerkit.get_account_id_by_slug('active-test'));

select is(
  (select public.active_account_id()),
  makerkit.get_account_id_by_slug('active-test'),
  'set_active_account points active_account_id at the team'
);

select row_eq(
  $$ select is_personal_account from public.active_account_workspace() $$,
  row(false),
  'active_account_workspace resolves the team after switching'
);

select isnt_empty(
  $$ select * from public.get_active_account_members() $$,
  'a team active account lists its members'
);

-- switching back to personal clears the team members
select public.set_active_account(tests.get_supabase_uid('aa_owner'));

select is_empty(
  $$ select * from public.get_active_account_members() $$,
  'switching back to personal clears the members list'
);

-- ----------------------------------------------------------------------------
-- Membership guard: cannot activate an account you do not belong to
-- ----------------------------------------------------------------------------

select makerkit.authenticate_as('aa_foreigner');

-- Target another user's personal account id (resolved without RLS) so the
-- membership guard is what rejects the switch.
select throws_ok(
  $$ select public.set_active_account(tests.get_supabase_uid('aa_member')) $$,
  'You are not a member of the target account',
  'set_active_account rejects a non-member target'
);

-- the failed switch stored nothing, so the foreigner stays on personal
select is(
  (select public.active_account_id()),
  tests.get_supabase_uid('aa_foreigner'),
  'a rejected switch leaves the active account on personal'
);

-- ----------------------------------------------------------------------------
-- RLS: a user only sees their own active-account row
-- ----------------------------------------------------------------------------

select makerkit.authenticate_as('aa_member');
select public.set_active_account(makerkit.get_account_id_by_slug('active-test'));

select makerkit.authenticate_as('aa_owner');

select is_empty(
  $$ select * from public.user_active_account where user_id = tests.get_supabase_uid('aa_member') $$,
  'a user cannot read another user active-account row'
);

-- ----------------------------------------------------------------------------
-- Privileges: user_id is the tenancy link and is not updatable by
-- authenticated at all (column-scoped UPDATE grant)
-- ----------------------------------------------------------------------------

select makerkit.authenticate_as('aa_member');

select throws_ok(
  $$ update public.user_active_account set user_id = tests.get_supabase_uid('aa_owner') $$,
  'permission denied for table user_active_account',
  'a user cannot re-parent their active-account row to another user'
);

-- ----------------------------------------------------------------------------
-- Direct INSERTs cannot bypass set_active_account's membership validation:
-- the with-check clause enforces the same rule
-- ----------------------------------------------------------------------------

select makerkit.authenticate_as('aa_foreigner');

select throws_ok(
  $$ insert into public.user_active_account (user_id, account_id)
     values (auth.uid(), makerkit.get_account_id_by_slug('active-test')) $$,
  'new row violates row-level security policy for table "user_active_account"',
  'a non-member cannot point their active account at a foreign team via direct insert'
);

select throws_ok(
  $$ insert into public.user_active_account (user_id, account_id)
     values (tests.get_supabase_uid('aa_owner'), tests.get_supabase_uid('aa_owner')) $$,
  'new row violates row-level security policy for table "user_active_account"',
  'a user cannot create an active-account row on behalf of another user'
);

-- ----------------------------------------------------------------------------
-- Self-heal: a stale team membership falls back to personal
-- ----------------------------------------------------------------------------

set local role postgres;

delete from public.accounts_memberships
where account_id = makerkit.get_account_id_by_slug('active-test')
  and user_id = tests.get_supabase_uid('aa_member');

select makerkit.authenticate_as('aa_member');

select is(
  (select public.active_account_id()),
  tests.get_supabase_uid('aa_member'),
  'a stale team membership self-heals to the personal account'
);

select * from finish();

ROLLBACK;
