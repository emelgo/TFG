
-- Section MFA Restrictions
-- MFA Restrictions:
-- the following policies are applied to the tables as a
-- restrictive policy to ensure that if MFA is enabled, then the policy will be applied.
-- For users that have not enabled MFA, the policy will not be applied and will keep the default behavior.
-- Restrict access to configuration if MFA is enabled
create policy restrict_mfa_configuration on cms.configuration as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to accounts if MFA is enabled
create policy restrict_mfa_accounts on cms.accounts as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to permissions
create policy restrict_mfa_permissions on cms.permissions as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to roles if MFA is enabled
create policy restrict_mfa_roles on cms.roles as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to account_permissions if MFA is enabled
create policy restrict_mfa_account_permissions on cms.account_permissions as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to account_roles if MFA is enabled
create policy restrict_mfa_account_roles on cms.account_roles as restrictive to authenticated using (cms.is_mfa_compliant ());

create policy restrict_mfa_role_permissions on cms.role_permissions as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to permission groups if MFA is enabled
create policy restrict_mfa_permission_groups on cms.permission_groups as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to permission groups permissions if MFA is enabled
create policy restrict_mfa_permission_groups_permissions on cms.permission_group_permissions as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to role_permission_groups if MFA is enabled
create policy restrict_mfa_role_permission_groups on cms.role_permission_groups as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to table metadata if MFA is enabled
create policy restrict_mfa_table_metadata on cms.table_metadata as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to saved views if MFA is enabled
create policy restrict_mfa_saved_views on cms.saved_views as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to saved view roles if MFA is enabled
create policy restrict_mfa_saved_view_roles on cms.saved_view_roles as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to audit logs if MFA is enabled
create policy restrict_mfa_audit_logs on cms.audit_logs as restrictive to authenticated using (cms.is_mfa_compliant ());