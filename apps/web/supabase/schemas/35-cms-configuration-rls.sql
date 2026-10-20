/*
 * -------------------------------------------------------
 * Sección: Políticas RLS de la configuración del CMS
 * -------------------------------------------------------
 */
-- Política SELECT: cualquier usuario con el indicador de acceso al CMS puede
-- leer la configuración. Se usa la comprobación barata del JWT y no
-- verify_admin_access porque esta última necesita leer `requires_mfa` (ver
-- cms.get_mfa_requirement en 23-cms-auth.sql).
-- READ(cms.configuration)
create policy read_configuration_value on cms.configuration for
select
  to authenticated using (cms.account_has_admin_access ());
-- Política UPDATE: requiere el permiso de sistema `system_setting:update`.
-- UPDATE(cms.configuration)
create policy update_configuration_value on cms.configuration
for update
  to authenticated using (
    cms.has_admin_permission (
      'system_setting'::cms.system_resource,
      'update'::cms.system_action
    )
  )
with
  check (
    cms.has_admin_permission (
      'system_setting'::cms.system_resource,
      'update'::cms.system_action
    )
  );
-- Política DELETE: requiere `system_setting:delete`.
-- DELETE(cms.configuration)
create policy delete_configuration_value on cms.configuration for delete to authenticated using (
  cms.has_admin_permission (
    'system_setting'::cms.system_resource,
    'delete'::cms.system_action
  )
);
-- Política INSERT: requiere `system_setting:insert`.
-- INSERT(cms.configuration)
create policy insert_configuration_value on cms.configuration for insert to authenticated
with
  check (
    cms.has_admin_permission (
      'system_setting'::cms.system_resource,
      'insert'::cms.system_action
    )
  );