
-- SECTION: CONFIGURATION RLS POLICIES
-- READ(cms.configuration)
create policy read_configuration_value on cms.configuration for
select
  to authenticated using (cms.account_has_admin_access ());

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

-- DELETE(cms.configuration)
create policy delete_configuration_value on cms.configuration for delete to authenticated using (
  cms.has_admin_permission (
    'system_setting'::cms.system_resource,
    'delete'::cms.system_action
  )
);

-- INSERT(cms.configuration)
create policy insert_configuration_value on cms.configuration for insert to authenticated
with
  check (
    cms.has_admin_permission (
      'system_setting'::cms.system_resource,
      'insert'::cms.system_action
    )
  );