
/*
 * -------------------------------------------------------
 * Sección: Políticas RLS del RBAC del CMS
 * Controlan quién puede ver y modificar roles, permisos, grupos y sus
 * asignaciones. Se apoyan en las funciones de 34-cms-permissions-functions.sql
 * y siguen dos reglas: nadie actúa sobre cuentas o roles de rango igual o
 * superior al suyo, y nadie puede conceder una capacidad que no tiene.
 * -------------------------------------------------------
 */
-- Política SELECT sobre cms.account_permissions: ¿puede el usuario ver un
-- permiso individual de una cuenta?
-- [TFG] RNF-02 · B-47: las cuatro políticas de esta tabla comparan el rango
-- propio con el de la cuenta afectada mediante `current_account_outranks`
-- (antes, `get_user_max_role_rank` de las dos cuentas; esa función ya no
-- responde por otras cuentas sin `account:select`).
create policy view_account_permissions on cms.account_permissions for
select
  to authenticated using (
    -- Cada usuario ve sus propios permisos.
    account_id = cms.get_current_user_account_id ()
    -- Quien gestiona permisos ve los de cuentas de rango inferior.
    or (
      cms.has_admin_permission (
        'permission'::cms.system_resource,
        'select'::cms.system_action
      )
      and cms.current_account_outranks (account_id)
    )
  );

-- Política SELECT sobre cms.role_permissions: ¿puede el usuario ver qué
-- permisos tiene un rol?
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

-- Política INSERT sobre cms.role_permissions: ¿puede el usuario asignar un
-- permiso a un rol?
create policy insert_role_permissions on cms.role_permissions for INSERT to authenticated
with
  check (
    cms.can_action_role (role_id, 'insert'::cms.system_action)
    and cms.has_admin_permission (
      'permission'::cms.system_resource,
      'insert'::cms.system_action
    )
    -- Solo se puede asignar un permiso cuya capacidad tenga el propio usuario;
    -- así nadie escala privilegios colgando un permiso demasiado amplio de un
    -- rol de su rango.
    and cms.can_grant_permission (permission_id)
  );

-- Política UPDATE sobre cms.role_permissions.
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

-- Política DELETE sobre cms.role_permissions: exige poder actuar sobre el rol
-- y el permiso de sistema `permission:delete`.
create policy delete_role_permissions on cms.role_permissions for DELETE to authenticated using (
  cms.can_action_role (role_id, 'delete')
  and cms.has_admin_permission ('permission'::cms.system_resource, 'delete')
);

-- Política SELECT sobre cms.permissions: ¿puede el usuario ver el catálogo de
-- permisos?
create policy view_permissions on cms.permissions for
select
  to authenticated using (
    -- Cualquier usuario con acceso al CMS puede ver el catálogo.
    cms.verify_admin_access ()
  );

-- Política INSERT sobre cms.permissions: crear un permiso exige
-- `permission:insert`; asignarlo después ya pasa por can_grant_permission.
create policy insert_permissions on cms.permissions for insert to authenticated
with
  check (
    cms.has_admin_permission (
      'permission'::cms.system_resource,
      'insert'::cms.system_action
    )
  );

-- Política UPDATE sobre cms.permissions.
-- can_modify_permission exige el permiso de administración Y la regla de
-- rango (el usuario debe superar a todos los roles que usan el permiso), para
-- que un administrador de rango bajo no pueda ampliar un permiso asignado a
-- su propio rol.
-- Nota (revisión de bugs 10x01): la protección contra "redelegar" cambiando la
-- forma de un permiso en el sitio la aplica el disparador BEFORE UPDATE
-- cms.enforce_permission_reshape_grantable (ver
-- 34-cms-permissions-functions.sql), NO esta política. Un WITH CHECK no ve la
-- fila antigua, así que no puede distinguir un cambio de capacidad de una
-- edición solo de nombre o descripción, y bloquearía ediciones legítimas de un
-- permiso potente que el usuario no tiene. El disparador compara OLD con NEW
-- y solo vuelve a validar cuando cambia una columna que define la capacidad.
create policy update_permissions on cms.permissions
for update
  to authenticated using (
    cms.can_modify_permission (id, 'update'::cms.system_action)
  )
with
  check (
    cms.can_modify_permission (id, 'update'::cms.system_action)
  );

-- Política DELETE sobre cms.permissions.
-- can_delete_permission exige el permiso de administración y la regla de
-- rango, y rechaza borrar un permiso que aún usan roles, grupos o cuentas.
create policy delete_permissions on cms.permissions for DELETE to authenticated using (
  cms.can_delete_permission (id)
);

-- Política INSERT sobre cms.account_permissions: ¿puede el usuario conceder o
-- denegar un permiso a una cuenta?
create policy insert_account_permissions on cms.account_permissions for INSERT to authenticated
with
  check (
    cms.has_admin_permission (
      'permission'::cms.system_resource,
      'insert'::cms.system_action
    )
    and cms.current_account_outranks (account_id)
    -- Solo se puede conceder un permiso cuya capacidad tenga el propio usuario.
    and cms.can_grant_permission (permission_id)
  );

-- Política UPDATE sobre cms.account_permissions.
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

-- Política DELETE sobre cms.account_permissions: exige `permission:delete` y un
-- rango superior al de la cuenta afectada.
create policy delete_account_permissions on cms.account_permissions for DELETE to authenticated using (
  cms.has_admin_permission (
    'permission'::cms.system_resource,
    'delete'::cms.system_action
  )
  and cms.current_account_outranks (account_id)
);

-- Políticas de cms.permission_group_permissions (permisos de cada grupo).
-- Política SELECT: se ven los permisos de los grupos que el usuario puede ver.
create policy view_permission_group_permissions on cms.permission_group_permissions for
select
  to authenticated using (
    cms.can_view_permission_group (cms.get_current_user_account_id (), group_id)
  );

-- Política INSERT: añadir un permiso a un grupo.
create policy insert_permission_group_permissions on cms.permission_group_permissions for INSERT to authenticated
with
  check (
    cms.can_modify_permission_group_permissions (group_id, 'insert'::cms.system_action)
    -- Solo se puede añadir un permiso cuya capacidad tenga el propio usuario,
    -- para que nadie inyecte un permiso excesivo en un grupo que sí puede
    -- modificar.
    and cms.can_grant_permission (permission_id)
  );

-- Política UPDATE sobre cms.permission_group_permissions.
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

-- Política DELETE sobre cms.permission_group_permissions.
create policy delete_permission_group_permissions on cms.permission_group_permissions for DELETE to authenticated using (
  cms.can_modify_permission_group_permissions (group_id, 'delete'::cms.system_action)
);

-- Política SELECT sobre cms.roles: ¿puede el usuario ver los roles?
create policy view_roles on cms.roles for
select
  to authenticated using (
    -- Cualquier usuario con acceso al CMS puede ver la lista de roles.
    cms.verify_admin_access ()
  );

-- Política UPDATE sobre cms.roles: solo sobre roles de rango inferior al propio.
create policy update_roles on cms.roles
for update
  to authenticated using (cms.can_action_role (id, 'update'))
with
  check (cms.can_action_role (id, 'update'));

-- Política DELETE sobre cms.roles: la decide cms.can_delete_role.
create policy delete_roles on cms.roles for DELETE to authenticated using (cms.can_delete_role (id));

-- Política INSERT sobre cms.roles: ¿puede el usuario crear un rol?
create policy insert_roles on cms.roles for INSERT to authenticated
with
  check (
    -- Hace falta el permiso `role:insert`...
    cms.has_admin_permission (
      'role'::cms.system_resource,
      'insert'::cms.system_action
    )
    and
    -- ...y el rango del rol nuevo debe ser inferior al máximo del usuario.
    rank < cms.get_user_max_role_rank (cms.get_current_user_account_id ())
  );


-- Política SELECT sobre cms.account_roles: ¿puede el usuario ver qué rol tiene
-- una cuenta?
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

-- Política INSERT sobre cms.account_roles: ¿puede el usuario asignar un rol a
-- una cuenta?
create policy insert_account_roles on cms.account_roles for INSERT to authenticated
with
  check (
    -- Lo decide can_modify_account_role (permiso y jerarquía de rangos).
    cms.can_modify_account_role (
      cms.get_current_user_account_id (),
      account_id,
      role_id,
      'insert'::cms.system_action
    )
  );

-- Política UPDATE sobre cms.account_roles: misma comprobación, antes y después
-- del cambio.
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

-- Política DELETE sobre cms.account_roles.
create policy delete_account_roles on cms.account_roles for DELETE to authenticated using (
  cms.can_modify_account_role (
    cms.get_current_user_account_id (),
    account_id,
    role_id,
    'delete'::cms.system_action
  )
);

-- Política SELECT sobre cms.permission_groups: ¿puede el usuario ver un grupo
-- de permisos?
create policy view_permissions_groups on cms.permission_groups for
select
  using (
    cms.can_view_permission_group (cms.get_current_user_account_id (), id)
  );

-- Política UPDATE sobre cms.permission_groups.
create policy update_permissions_groups on cms.permission_groups
for update
  to authenticated using (
    cms.can_modify_permission_group (id, 'update'::cms.system_action)
  );

-- Política DELETE sobre cms.permission_groups.
create policy delete_permissions_groups on cms.permission_groups for DELETE to authenticated using (
  cms.can_modify_permission_group (id, 'delete'::cms.system_action)
);

-- Política INSERT sobre cms.permission_groups: crear un grupo vacío exige
-- `permission:insert`; lo que se le añade después tiene sus propias políticas.
create policy insert_permission_groups on cms.permission_groups for insert to authenticated
with
  check (
    cms.has_admin_permission (
      'permission'::cms.system_resource,
      'insert'::cms.system_action
    )
  );

-- Política SELECT sobre cms.role_permission_groups: ¿puede el usuario ver qué
-- grupos tiene un rol?
create policy view_role_permission_groups on cms.role_permission_groups for
select
  to authenticated using (
    cms.can_view_role_permission_group (cms.get_current_user_account_id (), role_id)
  );

-- Política INSERT sobre cms.role_permission_groups: ¿puede el usuario asignar
-- un grupo a un rol?
-- can_modify_role_permission_group solo comprueba el rango del rol destino;
-- lo que limita las capacidades que se asignan es can_grant_permission_group.
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

-- Política UPDATE sobre cms.role_permission_groups.
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

-- Política DELETE sobre cms.role_permission_groups.
create policy delete_role_permission_groups on cms.role_permission_groups for DELETE to authenticated using (
  cms.can_modify_role_permission_group (
    cms.get_current_user_account_id (),
    role_id,
    'delete'::cms.system_action
  )
);
