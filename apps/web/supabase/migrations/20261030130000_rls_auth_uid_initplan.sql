-- B-60 (continuación) · `auth.uid()` evaluado una vez por fila en cinco políticas.
--
-- Mismo patrón que 20261030120000_rls_policies_initplan.sql, ahora con
-- `auth.uid()`: el borrado de equipos y las cuatro políticas de las imágenes
-- de cuenta en `storage.objects` lo llamaban sin envolver, así que PostgreSQL
-- lo evaluaba en cada fila. Con `(select auth.uid())` se evalúa una vez por
-- consulta (InitPlan). El resultado de cada política es el mismo.
--
-- Las expresiones se reproducen tal como están en el catálogo, cambiando
-- solo la llamada; los esquemas 03-accounts y 17-storage llevan ya la forma
-- nueva.


alter policy account_image_delete on storage.objects
  using (((bucket_id = 'account_image'::text) AND ((kit.get_storage_filename_as_uuid(name) = ( SELECT auth.uid() AS uid)) OR has_permission(( SELECT auth.uid() AS uid), kit.get_storage_filename_as_uuid(name), 'settings.manage'::app_permissions))));

alter policy account_image_insert on storage.objects
  with check (((bucket_id = 'account_image'::text) AND ((kit.get_storage_filename_as_uuid(name) = ( SELECT auth.uid() AS uid)) OR has_permission(( SELECT auth.uid() AS uid), kit.get_storage_filename_as_uuid(name), 'settings.manage'::app_permissions))));

alter policy account_image_select on storage.objects
  using (((bucket_id = 'account_image'::text) AND ((kit.get_storage_filename_as_uuid(name) = ( SELECT auth.uid() AS uid)) OR has_role_on_account(kit.get_storage_filename_as_uuid(name)))));

alter policy account_image_update on storage.objects
  using (((bucket_id = 'account_image'::text) AND ((kit.get_storage_filename_as_uuid(name) = ( SELECT auth.uid() AS uid)) OR has_permission(( SELECT auth.uid() AS uid), kit.get_storage_filename_as_uuid(name), 'settings.manage'::app_permissions))))
  with check (((bucket_id = 'account_image'::text) AND ((kit.get_storage_filename_as_uuid(name) = ( SELECT auth.uid() AS uid)) OR has_permission(( SELECT auth.uid() AS uid), kit.get_storage_filename_as_uuid(name), 'settings.manage'::app_permissions))));

alter policy delete_team_account on public.accounts
  using (((( SELECT auth.uid() AS uid) = primary_owner_user_id) AND (is_personal_account = false)));
