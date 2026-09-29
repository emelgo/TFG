BEGIN;

select no_plan();

-- Create fresh test users
select tests.create_supabase_user('update_test_owner', 'update-owner@test.com');
select tests.create_supabase_user('update_test_member', 'update-member@test.com');

-- Create team account using service_role and create_team_account function
-- DON'T authenticate first - the add_current_user_to_new_account trigger
-- would also create a membership if auth.uid() = primary_owner_user_id
-- The function already creates the membership, so we avoid duplicate by keeping auth.uid() NULL
set local role service_role;

select public.create_team_account('Update Test Team', tests.get_supabase_uid('update_test_owner'));

-- Add member to the team with 'member' role (still in service_role)

insert into public.accounts_memberships (account_id, user_id, account_role)
values (
    (select id from public.accounts where name = 'Update Test Team'),
    tests.get_supabase_uid('update_test_member'),
    'member'
);

-- Authenticate as member
select makerkit.authenticate_as('update_test_member');

-- Member tries to update their own role to 'owner' - should fail silently
update public.accounts_memberships
set account_role = 'owner'
where user_id = auth.uid()
and account_id = (select id from public.accounts where name = 'Update Test Team');

select row_eq(
    $$ select account_role from public.accounts_memberships where user_id = auth.uid() and account_id = (select id from public.accounts where name = 'Update Test Team'); $$,
    row('member'::varchar),
    'Updates fail silently to any field of the accounts_membership table'
);

select * from finish();

rollback;
