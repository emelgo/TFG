-- SECTION: ACCOUNT POLICIES
-- In this section, we define the account policies. The account policies are used to control the access to the accounts table.
-- SELECT(cms.accounts)
-- Can the current user view an account?
create policy select_accounts on cms.accounts for
select
  to AUTHENTICATED using (
    -- Any authenticated user with admin access can view the accounts table
    cms.verify_admin_access ()
  );

-- UPDATE(cms.accounts)
-- Can the current user update an account?
create policy update_accounts on cms.accounts
for update
  to AUTHENTICATED using (
    id = cms.get_current_user_account_id() OR
    -- Users can update their own account if they have the update account permission
    cms.can_action_account (id, 'update')
  );

-- DELETE(cms.accounts)
-- Can the current user delete an account?
create policy delete_accounts on cms.accounts for DELETE to AUTHENTICATED using (
  -- Users can delete their own account
  cms.can_action_account (id, 'delete')
);