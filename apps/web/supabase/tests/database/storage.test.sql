BEGIN;

select no_plan();

select pymekit.set_identifier('primary_owner', 'test@pymekit.test');
select pymekit.set_identifier('owner', 'owner@pymekit.test');
select pymekit.set_identifier('member', 'member@pymekit.test');
select pymekit.set_identifier('custom', 'custom@pymekit.test');

select pymekit.authenticate_as('member');

select throws_ok(
    $$ insert into storage.objects ("bucket_id", "metadata", "name", "owner", "owner_id", "version") values
        ('account_image', '{"key": "value"}', tests.get_supabase_uid('primary_owner'), tests.get_supabase_uid('primary_owner'), tests.get_supabase_uid('primary_owner'), 1); $$,
        'new row violates row-level security policy for table "objects"'
);

select pymekit.authenticate_as('primary_owner');

select lives_ok(
    $$ insert into storage.objects ("bucket_id", "metadata", "name", "owner", "owner_id", "version") values
        ('account_image', '{"key": "value"}', tests.get_supabase_uid('primary_owner'), tests.get_supabase_uid('primary_owner'), tests.get_supabase_uid('primary_owner'), 1); $$,
        'The owner should be able to insert a new object'
);

select isnt_empty(
    $$ select * from storage.objects where owner = tests.get_supabase_uid('primary_owner') $$,
    'The object should be inserted'
);

select pymekit.authenticate_as('owner');

select is_empty(
    $$ select * from storage.objects where owner = tests.get_supabase_uid('primary_owner') $$,
    'The owner should not be able to see the object'
);

-- create a new bucket
--
set local role postgres;

select lives_ok(
    $$ insert into storage.buckets ("name", "id", public) values ('new_bucket', 'new_bucket', true); $$
);

-- we create a mock policy allowing only the primary_owner to access the new bucket
-- this is a mock policy to check the existing policy system does not interfere with the new bucket
create policy new_bucket_policy on storage.objects for all using (
  bucket_id = 'new_bucket'
  and auth.uid() = tests.get_supabase_uid('primary_owner')
)
with check (
  bucket_id = 'new_bucket'
  and auth.uid() = tests.get_supabase_uid('primary_owner')
);

select pymekit.authenticate_as('member');

-- user should not be able to insert into the new bucket according to the new policy
select throws_ok(
    $$ insert into storage.objects ("bucket_id", "metadata", "name", "owner", "owner_id", "version") values
        ('new_bucket', '{"key": "value"}', 'some name', tests.get_supabase_uid('primary_owner'), tests.get_supabase_uid('primary_owner'), 1); $$,
        'new row violates row-level security policy for table "objects"'
);

select pymekit.authenticate_as('primary_owner');

-- primary_owner should be able to insert into the new bucket according to the new policy
-- this is to check the new policy system is working
--
select lives_ok(
    $$ insert into storage.objects ("bucket_id", "metadata", "name", "owner", "owner_id", "version") values
        ('new_bucket', '{"key": "value"}', 'some name', tests.get_supabase_uid('primary_owner'), tests.get_supabase_uid('primary_owner'), 1); $$,
        'new row violates row-level security policy for table "objects"'
);

set local role postgres;

-- create a new bucket with a custom policy
--
create policy new_custom_bucket_policy on storage.objects for all using (
  bucket_id = 'new_bucket'
  and auth.uid() = tests.get_supabase_uid('owner')
)
with check (
  bucket_id = 'new_bucket'
  and auth.uid() = tests.get_supabase_uid('owner')
);

select pymekit.authenticate_as('owner');

-- insert a new object into the new bucket
--
select lives_ok(
    $$ insert into storage.objects ("bucket_id", "metadata", "name", "owner", "owner_id", "version") values
        ('new_bucket', '{"key": "value"}', 'some name 2', tests.get_supabase_uid('primary_owner'), tests.get_supabase_uid('primary_owner'), 1); $$,
        'The primary_owner should be able to insert a new object into the new bucket'
);

-- check the object is inserted
--
select isnt_empty(
    $$ select * from storage.objects where bucket_id = 'new_bucket' $$,
    'The object should be inserted into the new bucket'
);

-- check other members cannot insert into the new bucket
select pymekit.authenticate_as('member');

select throws_ok(
    $$ insert into storage.objects ("bucket_id", "metadata", "name", "owner", "owner_id", "version") values
        ('new_bucket', '{"key": "value"}', 'some other name', tests.get_supabase_uid('primary_owner'), tests.get_supabase_uid('primary_owner'), 1); $$,
        'new row violates row-level security policy for table "objects"'
);

-- ----------------------------------------------------------------------------
-- account_image DELETE requires settings.manage on the team account: a member
-- whose role lacks the permission cannot delete the team image, while an
-- owner (settings.manage) can.
-- ----------------------------------------------------------------------------

set local role postgres;

-- the Storage API sets this GUC before deleting; without it a guard trigger
-- rejects every SQL DELETE regardless of RLS. Setting it here lets the tests
-- exercise the RLS delete policies the way the Storage API does.
set local storage.allow_delete_query = 'true';

-- the team image for the seeded 'pymekit' team, named after the account id
insert into storage.objects ("bucket_id", "metadata", "name", "version") values
    ('account_image', '{"key": "value"}', concat(pymekit.get_account_id_by_slug('pymekit'), '.png'), 1);

-- 'custom' holds custom-role on the team, which has NO permissions
select pymekit.authenticate_as('custom');

select isnt_empty(
    $$ select * from storage.objects where name = concat(pymekit.get_account_id_by_slug('pymekit'), '.png') $$,
    'A team member can read the team image'
);

-- a member without settings.manage cannot replace the team image
select throws_ok(
    $$ insert into storage.objects ("bucket_id", "metadata", "name", "version") values
        ('account_image', '{"forged": true}', concat(pymekit.get_account_id_by_slug('pymekit'), '.forged.png'), 1) $$,
    'new row violates row-level security policy for table "objects"',
    'A member without settings.manage cannot upload into the team image namespace'
);

-- an overwrite attempt matches no rows (UPDATE using-clause requires the
-- permission), so the object is untouched
select lives_ok(
    $$ update storage.objects set metadata = '{"tampered": true}'
       where name = concat(pymekit.get_account_id_by_slug('pymekit'), '.png') $$,
    'An overwrite attempt without settings.manage should not crash'
);

select results_eq(
    $$ select metadata from storage.objects where name = concat(pymekit.get_account_id_by_slug('pymekit'), '.png') $$,
    $$ values ('{"key": "value"}'::jsonb) $$,
    'The team image metadata is untouched after an overwrite attempt without settings.manage'
);

select lives_ok(
    $$ delete from storage.objects where name = concat(pymekit.get_account_id_by_slug('pymekit'), '.png') $$,
    'A delete attempt without settings.manage should not crash'
);

set local role postgres;

select isnt_empty(
    $$ select * from storage.objects where name = concat(pymekit.get_account_id_by_slug('pymekit'), '.png') $$,
    'The team image should still exist after a delete attempt by a member without settings.manage'
);

-- 'owner' holds the owner role, which has settings.manage
select pymekit.authenticate_as('owner');

select lives_ok(
    $$ delete from storage.objects where name = concat(pymekit.get_account_id_by_slug('pymekit'), '.png') $$,
    'A delete attempt with settings.manage should not crash'
);

set local role postgres;

select is_empty(
    $$ select * from storage.objects where name = concat(pymekit.get_account_id_by_slug('pymekit'), '.png') $$,
    'The team image should be deleted by a member with settings.manage'
);

select
  *
from
  finish();

rollback;