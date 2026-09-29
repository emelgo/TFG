/*
 * -------------------------------------------------------
 * Section: Storage
 * We create the schema for the storage
 * -------------------------------------------------------
 */

-- Account Image
insert into
  storage.buckets (id, name, PUBLIC)
values
  ('account_image', 'account_image', true)
on conflict (id)
do nothing;

-- Function: get the storage filename as a UUID.
-- Useful if you want to name files with UUIDs related to an account
create
or replace function kit.get_storage_filename_as_uuid (name text) returns uuid
set
  search_path = '' as $$
begin
    return replace(storage.filename(name), concat('.',
	storage.extension(name)), '')::uuid;

exception
  when invalid_text_representation then
    return null;
end;

$$ language plpgsql;

grant
execute on function kit.get_storage_filename_as_uuid (text) to authenticated,
service_role;

-- RLS policies for storage bucket account_image.
-- Files are named after the account uuid they belong to. Reading requires
-- membership; writing (insert/update/delete) requires ownership of the
-- personal account or the settings.manage permission on the team account.
-- Policies are split per command because DELETE only consults USING — a
-- single FOR ALL policy would let any member delete the team image.
create policy account_image_select on storage.objects for
select
  to authenticated using (
    bucket_id = 'account_image'
    and (
      kit.get_storage_filename_as_uuid (name) = auth.uid ()
      or public.has_role_on_account (kit.get_storage_filename_as_uuid (name))
    )
  );

create policy account_image_insert on storage.objects for insert to authenticated
with
  check (
    bucket_id = 'account_image'
    and (
      kit.get_storage_filename_as_uuid (name) = auth.uid ()
      or public.has_permission (
        auth.uid (),
        kit.get_storage_filename_as_uuid (name),
        'settings.manage'
      )
    )
  );

create policy account_image_update on storage.objects
for update
  to authenticated using (
    bucket_id = 'account_image'
    and (
      kit.get_storage_filename_as_uuid (name) = auth.uid ()
      or public.has_permission (
        auth.uid (),
        kit.get_storage_filename_as_uuid (name),
        'settings.manage'
      )
    )
  )
with
  check (
    bucket_id = 'account_image'
    and (
      kit.get_storage_filename_as_uuid (name) = auth.uid ()
      or public.has_permission (
        auth.uid (),
        kit.get_storage_filename_as_uuid (name),
        'settings.manage'
      )
    )
  );

create policy account_image_delete on storage.objects for delete to authenticated using (
  bucket_id = 'account_image'
  and (
    kit.get_storage_filename_as_uuid (name) = auth.uid ()
    or public.has_permission (
      auth.uid (),
      kit.get_storage_filename_as_uuid (name),
      'settings.manage'
    )
  )
);
