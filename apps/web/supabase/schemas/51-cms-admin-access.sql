
/*
 * -------------------------------------------------------
 * Sección: gestión del acceso al CMS del personal
 *
 * `grant_admin_access` y `revoke_admin_access` dan o retiran a un usuario
 * de Auth el acceso al CMS: el claim `cms_access` de `app_metadata` y su
 * cuenta en `cms.accounts`. Las llama la API del CMS (explorador de
 * usuarios) con la sesión del operador; son SECURITY DEFINER porque
 * escriben en `auth.users`, así que repiten todas las comprobaciones:
 * sesión, que no sea uno mismo, permiso `account`, jerarquía de rangos y que
 * el destino no sea un super-admin de la plataforma (su acceso lo gobierna el
 * pegamento de ADR-014, `53-cms-super-admin.sql`).
 *
 * [TFG] RNF-02 · F2.7a (bitácora, pendiente B de la F2.7a): el código
 * heredado devolvía `SQLERRM` dentro del resultado ante cualquier error
 * inesperado, y el texto de PostgreSQL (nombres de tablas, restricciones,
 * valores) acababa en la API. Ahora el campo `error` lleva SIEMPRE un código
 * estable (ver la lista) y el detalle solo va al log del servidor con
 * `RAISE LOG` (un `RAISE WARNING` llegaría al cliente, bitácora B-33).
 *
 * Códigos: NOT_AUTHENTICATED · SELF_ACTION · PERMISSION_DENIED ·
 * RANK_DENIED · PROTECTED · USER_NOT_FOUND · UPDATE_FAILED · INTERNAL_ERROR.
 *
 * El manejador `exception when others` revierte todo lo hecho dentro de la
 * función (claim, cuenta y auditoría), así que un fallo al auditar deja el
 * acceso como estaba: la auditoría falla en cerrado.
 * -------------------------------------------------------
 */
create or replace function cms.grant_admin_access (p_user_id uuid) returns jsonb
language plpgsql
security definer
set
  row_security = off
set
  search_path = '' as $$
declare
    v_current_user_id   uuid;
    v_existing_metadata jsonb;
    v_target_account_id uuid;
begin
    v_current_user_id := auth.uid();

    if v_current_user_id is null then
        return jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
    end if;

    if v_current_user_id = p_user_id then
        return jsonb_build_object('success', false, 'error', 'SELF_ACTION');
    end if;

    if not cms.has_admin_permission('account'::cms.system_resource, 'insert') then
        return jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED');
    end if;

    -- `for update`: bloquea la fila hasta el final para que el claim se
    -- escriba sobre lo mismo que se ha comprobado (sin «actualización
    -- perdida» si la plataforma cambia a la vez su `app_metadata`, por
    -- ejemplo al hacerlo super-admin).
    select raw_app_meta_data into v_existing_metadata
    from auth.users
    where id = p_user_id
    for update;

    if v_existing_metadata is null then
        return jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
    end if;

    -- El acceso de un super-admin de la plataforma no se gestiona desde el
    -- CMS (ADR-014): lo mantiene el *trigger* `cms.sync_super_admin_claim`.
    if v_existing_metadata ->> 'role' = 'super-admin' then
        return jsonb_build_object('success', false, 'error', 'PROTECTED');
    end if;

    -- Una cuenta que ya existe tiene rango: reactivarla es actuar SOBRE ella
    -- y debe respetar la jerarquía. Una cuenta nueva no tiene rango.
    select id into v_target_account_id
    from cms.accounts
    where auth_user_id = p_user_id;

    if v_target_account_id is not null
        and not cms.can_action_account(v_target_account_id, 'update'::cms.system_action) then
        return jsonb_build_object('success', false, 'error', 'RANK_DENIED');
    end if;

    update auth.users
    set raw_app_meta_data = coalesce(v_existing_metadata, '{}'::jsonb) || jsonb_build_object('cms_access', 'true'),
        updated_at = now()
    where id = p_user_id;

    if not found then
        return jsonb_build_object('success', false, 'error', 'UPDATE_FAILED');
    end if;

    insert into cms.accounts (auth_user_id, is_active)
    values (p_user_id, true)
    on conflict (auth_user_id) do update set
        is_active = true,
        updated_at = now();

    perform cms.create_audit_log(
        'grant_admin_access',
        'cms',
        'accounts',
        p_user_id::text,
        null,
        jsonb_build_object(
            'target_user_id', p_user_id,
            'action', 'grant_admin_access',
            'granted_by', v_current_user_id,
            'admin_access', true
        ),
        'info'::cms.audit_log_severity,
        jsonb_build_object('operation_type', 'admin_access_management')
    );

    return jsonb_build_object('success', true);

exception when others then
    raise log 'grant_admin_access failed for %: % (SQLSTATE: %)', p_user_id, SQLERRM, SQLSTATE;

    return jsonb_build_object('success', false, 'error', 'INTERNAL_ERROR');
end;
$$;

comment on function cms.grant_admin_access (uuid) is
  'Da acceso al CMS a un usuario (claim cms_access y cuenta activa) con permiso account:insert y respetando rangos; devuelve un código de error estable';

-- Retira el acceso al CMS: pone `cms_access = 'false'` y, si se pide,
-- desactiva la cuenta (se conserva el registro para la auditoría).
create or replace function cms.revoke_admin_access (
  p_user_id uuid,
  p_deactivate_account boolean default false
) returns jsonb
language plpgsql
security definer
set
  search_path = ''
set
  row_security = off as $$
declare
    v_current_user_id   uuid;
    v_existing_metadata jsonb;
    v_target_account_id uuid;
begin
    v_current_user_id := auth.uid();

    if v_current_user_id is null then
        return jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
    end if;

    if v_current_user_id = p_user_id then
        return jsonb_build_object('success', false, 'error', 'SELF_ACTION');
    end if;

    if not cms.has_admin_permission('account'::cms.system_resource, 'delete') then
        return jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED');
    end if;

    -- `for update`: bloquea la fila hasta el final para que el claim se
    -- escriba sobre lo mismo que se ha comprobado (sin «actualización
    -- perdida» si la plataforma cambia a la vez su `app_metadata`, por
    -- ejemplo al hacerlo super-admin).
    select raw_app_meta_data into v_existing_metadata
    from auth.users
    where id = p_user_id
    for update;

    if v_existing_metadata is null then
        return jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
    end if;

    if v_existing_metadata ->> 'role' = 'super-admin' then
        return jsonb_build_object('success', false, 'error', 'PROTECTED');
    end if;

    -- Jerarquía: solo se retira el acceso a cuentas de rango inferior. Sin
    -- cuenta en el CMS no hay rango que comprobar (no tiene acceso real).
    select id into v_target_account_id
    from cms.accounts
    where auth_user_id = p_user_id;

    if v_target_account_id is not null
        and not cms.can_action_account(v_target_account_id, 'update'::cms.system_action) then
        return jsonb_build_object('success', false, 'error', 'RANK_DENIED');
    end if;

    update auth.users
    set raw_app_meta_data = coalesce(v_existing_metadata, '{}'::jsonb) || jsonb_build_object('cms_access', 'false'),
        updated_at = now()
    where id = p_user_id;

    if not found then
        return jsonb_build_object('success', false, 'error', 'UPDATE_FAILED');
    end if;

    if p_deactivate_account then
        update cms.accounts
        set is_active = false,
            updated_at = now()
        where auth_user_id = p_user_id;
    end if;

    perform cms.create_audit_log(
        'revoke_admin_access',
        'cms',
        'accounts',
        p_user_id::text,
        null,
        jsonb_build_object(
            'target_user_id', p_user_id,
            'action', 'revoke_admin_access',
            'revoked_by', v_current_user_id,
            'deactivated_account', p_deactivate_account,
            'admin_access', false
        ),
        'info'::cms.audit_log_severity,
        jsonb_build_object('operation_type', 'admin_access_management')
    );

    return jsonb_build_object('success', true);

exception when others then
    raise log 'revoke_admin_access failed for %: % (SQLSTATE: %)', p_user_id, SQLERRM, SQLSTATE;

    return jsonb_build_object('success', false, 'error', 'INTERNAL_ERROR');
end;
$$;

comment on function cms.revoke_admin_access (uuid, boolean) is
  'Retira el acceso al CMS a un usuario con permiso account:delete y respetando rangos; devuelve un código de error estable';

-- Grant execute permissions to authenticated users
grant execute on function cms.grant_admin_access(uuid) to authenticated;

grant execute on function cms.revoke_admin_access(uuid, boolean) to authenticated;
/*
 * cms.set_account_active
 *
 * Activa o desactiva la cuenta del CMS de un miembro del personal (pantalla
 * Ajustes > Miembros). Es SECURITY DEFINER porque escribe `is_active` (que
 * `authenticated` no puede actualizar) y el claim `cms_access` en
 * `auth.users`: desactivar sin retirar el claim no sería una revocación real,
 * porque Auth lo vuelve a emitir en cada refresco del JWT.
 *
 * Se ejecuta con el JWT de quien actúa (la API la llama desde su transacción
 * con *claims*), así que la autorización y la auditoría (*trigger* de
 * `cms.accounts`) se atribuyen a esa persona.
 *
 * [TFG] RNF-02 · F2.7a (pendiente D, reglas de rango): nadie cambia su
 * propio estado, solo se actúa sobre cuentas de rango inferior
 * (`can_action_account`) y las cuentas raíz gestionadas por la plataforma
 * (super-admins, ADR-014) nunca se desactivan desde el CMS. Los errores son
 * códigos estables: INVALID_ARGUMENTS · MFA_REQUIRED · SELF_ACTION ·
 * PROTECTED · PERMISSION_DENIED · NOT_FOUND.
 */
create or replace function cms.set_account_active (
    p_account_id uuid,
    p_is_active boolean
) returns jsonb
set search_path = ''
set row_security = off
language plpgsql
security definer
as $$
declare
    v_auth_user_id uuid;
begin
    if p_account_id is null or p_is_active is null then
        return jsonb_build_object('success', false, 'error', 'INVALID_ARGUMENTS');
    end if;

    if not cms.is_mfa_compliant() then
        return jsonb_build_object('success', false, 'error', 'MFA_REQUIRED');
    end if;

    if p_account_id = cms.get_current_user_account_id() then
        return jsonb_build_object('success', false, 'error', 'SELF_ACTION');
    end if;

    if cms.is_root_managed_account(p_account_id) then
        return jsonb_build_object('success', false, 'error', 'PROTECTED');
    end if;

    if not cms.can_action_account(p_account_id, 'update'::cms.system_action) then
        return jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED');
    end if;

    select auth_user_id
    into v_auth_user_id
    from cms.accounts
    where id = p_account_id;

    if not found then
        return jsonb_build_object('success', false, 'error', 'NOT_FOUND');
    end if;

    update cms.accounts
    set is_active = p_is_active,
        updated_at = now()
    where id = p_account_id;

    if v_auth_user_id is not null then
        update auth.users
        set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) ||
                                jsonb_build_object('cms_access', case when p_is_active then 'true' else 'false' end),
            updated_at = now()
        where id = v_auth_user_id;
    end if;

    return jsonb_build_object('success', true);
end;
$$;

grant execute on function cms.set_account_active(uuid, boolean) to authenticated;
