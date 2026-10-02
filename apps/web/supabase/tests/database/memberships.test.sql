BEGIN;

select no_plan();

select pymekit.set_identifier('primary_owner', 'test@pymekit.test');
select pymekit.set_identifier('owner', 'owner@pymekit.test');
select pymekit.set_identifier('member', 'member@pymekit.test');
select pymekit.set_identifier('custom', 'custom@pymekit.test');

-- another user not in the team
select tests.create_supabase_user('test', 'test@supabase.com');

select pymekit.authenticate_as('owner');

-- Can check if an account is a team member

-- Primary owner
select is(
  (select public.is_team_member(
    pymekit.get_account_id_by_slug('pymekit'),
    tests.get_supabase_uid('member')
  )),
  true,
  'The primary account owner can check if a member is a team member'
);

select pymekit.authenticate_as('member');

-- Member
select is(
  (select public.is_team_member(
    pymekit.get_account_id_by_slug('pymekit'),
    tests.get_supabase_uid('owner')
  )),
  true,
  'The member can check if another member is a team member'
);

select is(
  (select public.has_role_on_account(
    pymekit.get_account_id_by_slug('pymekit')
  )),
  true,
  'The member can check if they have a role on the account'
);

select isnt_empty(
  $$ select * from public.get_account_members('pymekit') $$,
  'The member can query the team account memberships using the get_account_members function'
);

select pymekit.authenticate_as('test');

-- Foreigners
-- Cannot query the team account memberships
select is(
  (select public.is_team_member(
    pymekit.get_account_id_by_slug('pymekit'),
    tests.get_supabase_uid('owner')
  )),
  false,
  'The foreigner cannot check if a member is a team member'
);

-- Does not have a role on the account
select is(
  (select public.has_role_on_account(
    pymekit.get_account_id_by_slug('pymekit')
  )),
  false,
  'The foreigner does not have a role on the account'
);

select is_empty(
  $$ select * from public.accounts_memberships where account_id = pymekit.get_account_id_by_slug('pymekit') $$,
  'The foreigner cannot query the team account memberships'
);

select is_empty(
  $$ select * from public.accounts where id = pymekit.get_account_id_by_slug('pymekit') $$,
  'The foreigner cannot query the team account'
);

select is_empty(
  $$ select * from public.get_account_members('pymekit') $$,
  'The foreigner cannot query the team members'
);

-- ----------------------------------------------------------------------------
-- Memberships cannot be forged through the data API: authenticated has no
-- INSERT privilege at all (rows are created only by accept_invitation via the
-- service_role client and by the SECURITY DEFINER create_team_account).
-- ----------------------------------------------------------------------------

-- the foreigner cannot add themselves to a team
select throws_ok(
  $$ insert into public.accounts_memberships (account_id, user_id, account_role)
     values (pymekit.get_account_id_by_slug('pymekit'), auth.uid(), 'member') $$,
  'permission denied for table accounts_memberships',
  'A foreigner cannot insert their own membership'
);

-- even the team owner cannot insert memberships directly
select pymekit.authenticate_as('owner');

select throws_ok(
  $$ insert into public.accounts_memberships (account_id, user_id, account_role)
     values (pymekit.get_account_id_by_slug('pymekit'), tests.get_supabase_uid('test'), 'member') $$,
  'permission denied for table accounts_memberships',
  'The team owner cannot insert memberships directly'
);

-- a member cannot re-parent their membership into another account or hand it
-- to another user: user_id/account_id carry no UPDATE privilege
select pymekit.authenticate_as('member');

select throws_ok(
  $$ update public.accounts_memberships
     set account_id = tests.get_supabase_uid('member')
     where user_id = auth.uid() $$,
  'permission denied for table accounts_memberships',
  'A member cannot change the account their membership points at'
);

select throws_ok(
  $$ update public.accounts_memberships
     set user_id = tests.get_supabase_uid('test')
     where user_id = auth.uid() $$,
  'permission denied for table accounts_memberships',
  'A member cannot hand their membership to another user'
);

select * from finish();

rollback;
