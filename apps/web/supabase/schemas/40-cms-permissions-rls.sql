
-- SECTION: ACCOUNT PERMISSIONS POLICIES
-- In this section, we define the account permissions policies. The account permissions policies are used to control the access to the account permissions table.
-- SELECT(cms.account_permissions)
-- Can the current user view an account permission?
-- [TFG] RNF-02 · B-47: las cuatro políticas de esta tabla comparan el rango
-- propio con el de la cuenta afectada mediante `current_account_outranks`
-- (antes, `get_user_max_role_rank` de las dos cuentas; esa función ya no
-- responde por otras cuentas sin `account:select`).
create policy view_account_permissions on cms.account_permissions for
select
  to authenticated using (
    -- Users can see their own permissions
    account_id = cms.get_current_user_account_id ()
    -- Users with permission management rights can see permissions of users with lower rank
    or (
      cms.has_admin_permission (
        'permission'::cms.system_resource,
        'select'::cms.system_action
      )
      and cms.current_account_outranks (account_id)
    )
  );

-- SELECT(cms.role_permissions)
-- Can the current user view a role permission?
-- [TFG] RNF-02 · Corrección de PymeKit: la condición heredada
-- `ar.role_id = role_id` comparaba la columna consigo misma (dentro de la
-- subconsulta `role_id` se resuelve como `ar.role_id`), así que cualquiera con
-- un rol veía TODAS las asignaciones. Ahora cada usuario ve las de sus propios
-- roles, y quien puede consultar permisos (`permission:select`, necesario para
-- la pantalla de gestión de roles) las ve todas.
create policy view_role_permissions on cms.role_permissions for
select
  to AUTHENTICATED using (
    exists (
      select
        1
      from
        cms.account_roles ar
      where
        ar.account_id = cms.get_current_user_account_id ()
        and ar.role_id = role_permissions.role_id
    )
    or cms.has_admin_permission (
      'permission'::cms.system_resource,
      'select'::cms.system_action
    )
  );

-- INSERT(cms.role_permissions)
-- Can the current user insert a role permission?
create policy insert_role_permissions on cms.role_permissions for INSERT to authenticated
with
  check (
    cms.can_action_role (role_id, 'insert'::cms.system_action)
    and cms.has_admin_permission (
      'permission'::cms.system_resource,
      'insert'::cms.system_action
    )
    -- The user may only attach a permission whose capability they themselves hold,
    -- preventing escalation by binding an over-broad permission to an in-rank role.
    and cms.can_grant_permission (permission_id)
  );

-- UPDATE(cms.role_permissions)
-- Can the current user update a role permission?
-- [TFG] RNF-02 · Corrección de PymeKit (brecha heredada detectada en /rls-review).
-- Sin WITH CHECK, PostgreSQL reutiliza el USING para la fila nueva y no
-- comprobaba `can_grant_permission`: un miembro del personal con permiso
-- `permission:update` podía cambiar `permission_id` y colgar de un rol inferior
-- un permiso que él mismo no tiene (p. ej. el de datos de Root). El WITH CHECK
-- aplica a la fila resultante las mismas reglas que el INSERT.
create policy update_role_permissions on cms.role_permissions
for update
  to authenticated using (
    cms.can_action_role (role_id, 'update')
    and cms.has_admin_permission ('permission'::cms.system_resource, 'update')
  )
with
  check (
    cms.can_action_role (role_id, 'update')
    and cms.has_admin_permission ('permission'::cms.system_resource, 'update')
    and cms.can_grant_permission (permission_id)
  );

-- DELETE(cms.role_permissions)
-- Can the current user delete a role permission?
create policy delete_role_permissions on cms.role_permissions for DELETE to authenticated using (
  cms.can_action_role (role_id, 'delete')
  and cms.has_admin_permission ('permission'::cms.system_resource, 'delete')
);

-- SELECT(cms.permissions)
-- Can the current user view a permission?
create policy view_permissions on cms.permissions for
select
  to authenticated using (
    -- Any authenticated user with admin access can view the permissions table
    cms.verify_admin_access ()
  );

-- INSERT(cms.permissions)
-- Can the current user insert a permission?
create policy insert_permissions on cms.permissions for insert to authenticated
with
  check (
    cms.has_admin_permission (
      'permission'::cms.system_resource,
      'insert'::cms.system_action
    )
  );

-- UPDATE(cms.permissions)
-- Can the current user update a permission?
-- can_modify_permission enforces the admin permission AND the rank gate
-- (the user must out-rank every role that uses this permission), preventing a
-- low-rank admin from broadening a permission attached to their own role.
-- NOTE (bug-hunt 10x01): the in-place reshape re-delegation guard is enforced by the
-- BEFORE UPDATE trigger cms.enforce_permission_reshape_grantable (see 30-triggers.sql),
-- NOT here. A WITH CHECK cannot see the OLD row, so it cannot distinguish a capability
-- reshape from a metadata-only edit (name/description) and would over-block legitimate
-- edits of a powerful permission the caller doesn't personally hold. The trigger compares
-- OLD vs NEW and only re-validates when a capability-defining column actually changes.
create policy update_permissions on cms.permissions
for update
  to authenticated using (
    cms.can_modify_permission (id, 'update'::cms.system_action)
  )
with
  check (
    cms.can_modify_permission (id, 'update'::cms.system_action)
  );

-- DELETE(cms.permissions)
-- Can the current user delete a permission?
-- can_delete_permission enforces the admin permission, the rank gate, and
-- refuses deletion of a permission still in use by roles/groups/accounts.
create policy delete_permissions on cms.permissions for DELETE to authenticated using (
  cms.can_delete_permission (id)
);

-- INSERT(cms.account_permissions)
-- Can the current user insert an account permission?
create policy insert_account_permissions on cms.account_permissions for INSERT to authenticated
with
  check (
    cms.has_admin_permission (
      'permission'::cms.system_resource,
      'insert'::cms.system_action
    )
    and cms.current_account_outranks (account_id)
    -- The user may only grant a permission whose capability they themselves hold.
    and cms.can_grant_permission (permission_id)
  );

-- UPDATE(cms.account_permissions)
-- Can the current user update an account permission?
-- [TFG] RNF-02 · Mismo arreglo que en update_role_permissions: el WITH CHECK
-- impide cambiar `permission_id` por un permiso que el usuario no posee o
-- `account_id` por una cuenta de rango igual o superior.
create policy update_account_permissions on cms.account_permissions
for update
  to authenticated using (
    cms.has_admin_permission (
      'permission'::cms.system_resource,
      'update'::cms.system_action
    )
    and cms.current_account_outranks (account_id)
  )
with
  check (
    cms.has_admin_permission (
      'permission'::cms.system_resource,
      'update'::cms.system_action
    )
    and cms.current_account_outranks (account_id)
    and cms.can_grant_permission (permission_id)
  );

-- DELETE(cms.account_permissions)
-- Can the current user delete an account permission?
create policy delete_account_permissions on cms.account_permissions for DELETE to authenticated using (
  cms.has_admin_permission (
    'permission'::cms.system_resource,
    'delete'::cms.system_action
  )
  and cms.current_account_outranks (account_id)
);

-- SECTION: PERMISSION GROUP PERMISSIONS POLICIES
-- In this section, we define the permission group permissions policies. The permission group permissions policies are used to control the access to the permission group permissions table.
-- SELECT(cms.permission_group_permissions)
-- Can the current user view a permission group permission?
create policy view_permission_group_permissions on cms.permission_group_permissions for
select
  to authenticated using (
    cms.can_view_permission_group (cms.get_current_user_account_id (), group_id)
  );

-- INSERT(cms.permission_group_permissions)
-- Can the current user insert a permission group permission?
create policy insert_permission_group_permissions on cms.permission_group_permissions for INSERT to authenticated
with
  check (
    cms.can_modify_permission_group_permissions (group_id, 'insert'::cms.system_action)
    -- The user may only add a permission whose capability they themselves hold,
    -- preventing injection of an over-privileged permission into a group they can modify.
    and cms.can_grant_permission (permission_id)
  );

-- UPDATE(cms.permission_group_permissions)
-- Can the current user update a permission group permission?
-- [TFG] RNF-02 · Mismo arreglo: la fila nueva debe seguir cumpliendo que el
-- usuario puede modificar el grupo destino y que posee el permiso asignado.
create policy update_permission_group_permissions on cms.permission_group_permissions
for update
  to authenticated using (
    cms.can_modify_permission_group_permissions (group_id, 'update'::cms.system_action)
  )
with
  check (
    cms.can_modify_permission_group_permissions (group_id, 'update'::cms.system_action)
    and cms.can_grant_permission (permission_id)
  );

-- DELETE(cms.permission_group_permissions)
-- Can the current user delete a permission group permission?
create policy delete_permission_group_permissions on cms.permission_group_permissions for DELETE to authenticated using (
  cms.can_modify_permission_group_permissions (group_id, 'delete'::cms.system_action)
);

-- SELECT(cms.roles)
-- Can the current user view a role?
create policy view_roles on cms.roles for
select
  to authenticated using (
    -- Any authenticated user with admin access can view the roles table
    cms.verify_admin_access ()
  );

-- UPDATE(cms.roles)
-- Can the current user update a role?
create policy update_roles on cms.roles
for update
  to authenticated using (cms.can_action_role (id, 'update'))
with
  check (cms.can_action_role (id, 'update'));

-- DELETE(cms.roles)
-- Can the current user delete a role?
create policy delete_roles on cms.roles for DELETE to authenticated using (cms.can_delete_role (id));

-- INSERT(cms.roles)
-- Can the current user insert a role?
create policy insert_roles on cms.roles for INSERT to authenticated
with
  check (
    -- The user must have the insert role permission AND
    cms.has_admin_permission (
      'role'::cms.system_resource,
      'insert'::cms.system_action
    )
    and
    -- The role rank must be less than the user's maximum role rank
    rank < cms.get_user_max_role_rank (cms.get_current_user_account_id ())
  );


-- SELECT(cms.account_roles)
-- Can the current user view an account role?
-- [TFG] RNF-02 · B-47: antes bastaba con tener acceso al CMS
-- (`verify_admin_access`), así que cualquier miembro del personal (Soporte,
-- por ejemplo) leía todas las asignaciones de roles, incluida la de Root.
-- Ahora cada uno ve la suya y solo quien puede consultar las cuentas
-- (`account:select`, como Ajustes > Miembros) ve las de los demás. El número
-- de miembros de un rol se obtiene con `cms.count_role_members`.
create policy view_account_roles on cms.account_roles for
select
  to authenticated using (
    (
      account_id = cms.get_current_user_account_id ()
      and cms.verify_admin_access ()
    )
    or cms.has_admin_permission (
      'account'::cms.system_resource,
      'select'::cms.system_action
    )
  );

-- INSERT(cms.account_roles)
-- Can the current user insert an account role?
create policy insert_account_roles on cms.account_roles for INSERT to authenticated
with
  check (
    -- We verify if the user can modify the account role
    cms.can_modify_account_role (
      cms.get_current_user_account_id (),
      account_id,
      role_id,
      'insert'::cms.system_action
    )
  );

-- UPDATE(cms.account_roles)
-- Can the current user update an account role?
create policy update_account_roles on cms.account_roles
for update
  to authenticated using (
    cms.can_modify_account_role (
      cms.get_current_user_account_id (),
      account_id,
      role_id,
      'update'::cms.system_action
    )
  )
with
  check (
    cms.can_modify_account_role (
      cms.get_current_user_account_id (),
      account_id,
      role_id,
      'update'::cms.system_action
    )
  );

-- DELETE(cms.account_roles)
-- Can the current user delete an account role?
create policy delete_account_roles on cms.account_roles for DELETE to authenticated using (
  cms.can_modify_account_role (
    cms.get_current_user_account_id (),
    account_id,
    role_id,
    'delete'::cms.system_action
  )
);

-- SELECT(cms.permission_groups)
-- Can the current user view a permission group?
create policy view_permissions_groups on cms.permission_groups for
select
  using (
    cms.can_view_permission_group (cms.get_current_user_account_id (), id)
  );

-- UPDATE(cms.permission_groups)
-- Can the current user update a permission group?
create policy update_permissions_groups on cms.permission_groups
for update
  to authenticated using (
    cms.can_modify_permission_group (id, 'update'::cms.system_action)
  );

-- DELETE(cms.permission_groups)
-- Can the current user delete a permission group?
create policy delete_permissions_groups on cms.permission_groups for DELETE to authenticated using (
  cms.can_modify_permission_group (id, 'delete'::cms.system_action)
);

-- INSERT(cms.permission_groups)
-- Can the current user insert a permission group?
create policy insert_permission_groups on cms.permission_groups for insert to authenticated
with
  check (
    cms.has_admin_permission (
      'permission'::cms.system_resource,
      'insert'::cms.system_action
    )
  );

-- SELECT(cms.role_permission_groups)
-- Can the current user view a role permission group?
create policy view_role_permission_groups on cms.role_permission_groups for
select
  to authenticated using (
    cms.can_view_role_permission_group (cms.get_current_user_account_id (), role_id)
  );

-- INSERT(cms.role_permission_groups)
-- Can the current user insert a role permission group?
-- can_modify_role_permission_group only ranks the target role; can_grant_permission_group
-- is what constrains the capabilities being attached.
create policy insert_role_permission_groups on cms.role_permission_groups for insert to authenticated
with
  check (
    cms.can_modify_role_permission_group (
      cms.get_current_user_account_id (),
      role_id,
      'insert'::cms.system_action
    )
    and cms.can_grant_permission_group (group_id)
  );

-- UPDATE(cms.role_permission_groups)
-- Can the current user update a role permission group?
create policy update_role_permission_groups on cms.role_permission_groups
for update
  to authenticated using (
    cms.can_modify_role_permission_group (
      cms.get_current_user_account_id (),
      role_id,
      'update'::cms.system_action
    )
  )
with
  check (
    cms.can_modify_role_permission_group (
      cms.get_current_user_account_id (),
      role_id,
      'update'::cms.system_action
    )
    and cms.can_grant_permission_group (group_id)
  );

-- DELETE(cms.role_permission_groups)
-- Can the current user delete a role permission group?
create policy delete_role_permission_groups on cms.role_permission_groups for DELETE to authenticated using (
  cms.can_modify_role_permission_group (
    cms.get_current_user_account_id (),
    role_id,
    'delete'::cms.system_action
  )
);
