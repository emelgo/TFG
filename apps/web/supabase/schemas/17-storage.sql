/*
 * -------------------------------------------------------
 * Sección: Almacenamiento de ficheros
 * Configura el *bucket* de Supabase Storage para las imágenes de las
 * cuentas (avatar del usuario y logotipo del equipo) y sus políticas RLS
 * sobre storage.objects. Cada fichero se nombra con el uuid de la cuenta a
 * la que pertenece, y las políticas usan ese nombre para decidir quién
 * puede leerlo o modificarlo.
 * -------------------------------------------------------
 */

-- Bucket `account_image`: público para que las imágenes se puedan servir por
-- URL directa sin firmar (no contienen información sensible).
insert into
  storage.buckets (id, name, PUBLIC)
values
  ('account_image', 'account_image', true)
on conflict (id)
do nothing;

-- Función `kit.get_storage_filename_as_uuid`: extrae el uuid de cuenta del
-- nombre del fichero (sin extensión). Si el nombre no es un uuid válido,
-- devuelve NULL, de modo que ninguna política lo autoriza.
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

-- Políticas RLS del bucket account_image.
-- Los ficheros se nombran con el uuid de la cuenta a la que pertenecen. Para
-- leer hace falta ser miembro; para escribir (insertar, actualizar o borrar),
-- ser el dueño de la cuenta personal o tener el permiso `settings.manage` en
-- la cuenta de equipo.
-- Hay una política por operación porque DELETE solo consulta USING: una única
-- política FOR ALL permitiría a cualquier miembro borrar la imagen del equipo.
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
