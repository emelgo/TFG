BEGIN;

select no_plan();

--- we insert a user into auth.users and return the id into user_id to use

select tests.create_supabase_user('test1', 'test1@test.com');

select tests.create_supabase_user('test2');

------------
--- Primary Owner
------------
select makerkit.authenticate_as('test1');

-- should create the personal account automatically with the same ID as the user
SELECT row_eq(
   $$ select primary_owner_user_id, is_personal_account, name from public.accounts order by created_at desc limit 1 $$,
   ROW (tests.get_supabase_uid('test1'), true, 'test1'::varchar),
   'Inserting a user should create a personal account when personal accounts are enabled'
);

-- anon users should not be able to see the personal account

set local role anon;

-- anon tiene `usage` sobre public desde F2.6b (blog público), así que el
-- rechazo llega ahora en la tabla, no en el esquema
SELECT throws_ok(
   $$ select * from public.accounts order by created_at desc limit 1 $$,
    'permission denied for table accounts'
);

-- the primary owner should be able to see the personal account

select makerkit.authenticate_as('test1');

SELECT isnt_empty(
   $$ select * from public.accounts where primary_owner_user_id = tests.get_supabase_uid('test1') $$,
    'The primary owner should be able to see the personal account'
);

update public.accounts
set public_data = '{"profile_completed": true}'::jsonb
where id = tests.get_supabase_uid('test1');

select row_eq(
  $$ select public_data from public.user_account_workspace $$,
  row('{"profile_completed": true}'::jsonb),
  'The personal account workspace view exposes public_data'
);

-- a user cannot delete their own personal account row directly: the
-- delete_team_account policy only covers team accounts, and personal accounts
-- are deleted through the admin flow (auth.admin.deleteUser)
select lives_ok(
   $$ delete from public.accounts where id = tests.get_supabase_uid('test1') $$,
   'Deleting the personal account directly should not crash'
);

SELECT isnt_empty(
   $$ select * from public.accounts where id = tests.get_supabase_uid('test1') $$,
    'The personal account should still exist after a direct delete attempt'
);

-- identity columns carry no UPDATE privilege for authenticated: forging the
-- account email or flipping the personal flag is rejected up front
select throws_ok(
   $$ update public.accounts set email = 'forged@test.com' where id = tests.get_supabase_uid('test1') $$,
   'permission denied for table accounts',
   'A user cannot change their account email through the data API'
);

select throws_ok(
   $$ update public.accounts set is_personal_account = false where id = tests.get_supabase_uid('test1') $$,
   'permission denied for table accounts',
   'A user cannot flip the personal-account flag'
);

------------
--- Other Users

-- other users should not be able to see the personal account

select makerkit.authenticate_as('test2');

SELECT is_empty(
   $$ select * from public.accounts where primary_owner_user_id = tests.get_supabase_uid('test1') $$,
    'Other users should not be able to see the personal account'
);

SELECT *
FROM finish();

ROLLBACK;
