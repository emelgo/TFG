/*
 * -------------------------------------------------------
 * Sección: Políticas RLS de las vistas guardadas
 * Cada vista pertenece a su creador, el único que puede modificarla o
 * borrarla; los demás solo la ven si se ha compartido con un rol que tengan.
 * -------------------------------------------------------
 */
-- Política INSERT sobre cms.saved_views: solo se pueden crear vistas a nombre
-- propio.
create policy insert_saved_views on cms.saved_views for INSERT to authenticated
with
  check (
    created_by = cms.get_current_user_account_id ()
  );

-- Política UPDATE: solo el creador, y sin poder cambiar de dueño.
create policy update_saved_views on cms.saved_views
for update
  to authenticated using (
    created_by = cms.get_current_user_account_id ()
  )
with
  check (
    created_by = cms.get_current_user_account_id ()
  );

-- Política DELETE: solo el creador.
create policy delete_saved_views on cms.saved_views for DELETE to authenticated using (
  created_by = cms.get_current_user_account_id ()
);

-- Política SELECT: el creador ve sus propias vistas.
create policy view_personal_saved_views on cms.saved_views for
select
  to authenticated using (
    created_by = cms.get_current_user_account_id ()
  );

-- Política SELECT: también se ven las vistas compartidas con alguno de los
-- roles del usuario (a través de cms.saved_view_roles).
create policy view_shared_saved_views on cms.saved_views for
select
  to authenticated using (
    exists (
      select
        1
      from
        cms.saved_view_roles
      where
        view_id = cms.saved_views.id
        and cms.account_has_role (cms.get_current_user_account_id (), role_id)
    )
  );

-- Política SELECT sobre cms.saved_view_roles: cada usuario ve las
-- asignaciones de los roles que tiene.
create policy view_personal_saved_view_roles on cms.saved_view_roles for
select
  to authenticated using (
    cms.account_has_role (cms.get_current_user_account_id (), role_id)
  );

-- INSERT(cms.saved_view_roles)
-- Compartir una vista con un rol: solo el creador de la vista y solo con
-- roles de rango inferior al suyo.
-- [TFG] RNF-02 · ADR-015 (pendiente cerrado en F2.7b): la política heredada
-- solo comprobaba el rango del rol, no de quién era la vista. Cualquier
-- miembro del personal podía compartir la vista personal de OTRO (y hacer
-- visibles sus filtros y columnas a todo un rol) si conocía su id. Las
-- columnas van cualificadas con el nombre de la tabla (lección de B-09).
create policy insert_shared_saved_views on cms.saved_view_roles for INSERT to authenticated
with
  check (
    exists (
      select
        1
      from
        cms.saved_views sv
      where
        sv.id = saved_view_roles.view_id
        and sv.created_by = cms.get_current_user_account_id ()
    )
    and cms.get_user_max_role_rank (cms.get_current_user_account_id ()) > (
      select
        r.rank
      from
        cms.roles r
      where
        r.id = saved_view_roles.role_id
    )
  );