/*
 * -------------------------------------------------------
 * Sección: Políticas RLS de las cuentas del CMS
 * -------------------------------------------------------
 */
-- Política SELECT: cualquier usuario con acceso al CMS puede ver la lista de
-- cuentas del panel.
create policy select_accounts on cms.accounts for
select
  to AUTHENTICATED using (
    -- Basta con superar el punto de control común del CMS.
    cms.verify_admin_access ()
  );

-- Política UPDATE: delega en cms.can_action_account, que exige el permiso
-- `account:update` y un rango superior al de la cuenta afectada.
create policy update_accounts on cms.accounts
for update
  to AUTHENTICATED using (
    id = cms.get_current_user_account_id() OR
    -- Permiso y jerarquía de rangos.
    cms.can_action_account (id, 'update')
  );

-- Política DELETE: igual, con el permiso `account:delete`.
create policy delete_accounts on cms.accounts for DELETE to AUTHENTICATED using (
  -- Permiso y jerarquía de rangos.
  cms.can_action_account (id, 'delete')
);