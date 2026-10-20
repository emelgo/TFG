
/*
 * -------------------------------------------------------
 * Sección: Restricciones de MFA en las tablas del CMS
 * Igual que en 13-mfa.sql, estas políticas son restrictivas (`as
 * restrictive`): se combinan con AND con las permisivas, así que no
 * conceden nada por sí mismas. A quien no tiene la MFA activada no le
 * afectan; a quien la tiene le ocultan los datos del CMS hasta completar el
 * segundo factor (sesión `aal2`).
 * -------------------------------------------------------
 */
-- Configuración.
create policy restrict_mfa_configuration on cms.configuration as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Cuentas.
create policy restrict_mfa_accounts on cms.accounts as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Permisos.
create policy restrict_mfa_permissions on cms.permissions as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Roles.
create policy restrict_mfa_roles on cms.roles as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Permisos por cuenta.
create policy restrict_mfa_account_permissions on cms.account_permissions as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Asignación de roles a cuentas.
create policy restrict_mfa_account_roles on cms.account_roles as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Permisos de cada rol.
create policy restrict_mfa_role_permissions on cms.role_permissions as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Grupos de permisos.
create policy restrict_mfa_permission_groups on cms.permission_groups as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Permisos de cada grupo.
create policy restrict_mfa_permission_groups_permissions on cms.permission_group_permissions as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Grupos asignados a cada rol.
create policy restrict_mfa_role_permission_groups on cms.role_permission_groups as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Metadatos de tablas.
create policy restrict_mfa_table_metadata on cms.table_metadata as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Vistas guardadas.
create policy restrict_mfa_saved_views on cms.saved_views as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Vistas compartidas con roles.
create policy restrict_mfa_saved_view_roles on cms.saved_view_roles as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Registro de auditoría.
create policy restrict_mfa_audit_logs on cms.audit_logs as restrictive to authenticated using (cms.is_mfa_compliant ());