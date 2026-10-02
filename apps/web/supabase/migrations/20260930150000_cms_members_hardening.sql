/*
 * Endurecimiento de los ajustes del CMS: miembros, autenticación y
 * auditoría (F2.7a, PymeKit). Refleja los cambios de los esquemas
 * `28-cms-roles-functions.sql`, `34-cms-permissions-functions.sql`,
 * `46-cms-crud-functions.sql`, `47-cms-audit-logs.sql`,
 * `50-cms-triggers.sql`, `51-cms-admin-access.sql` y el nuevo
 * `54-cms-members-hardening.sql`:
 *
 * A · Autor de la auditoría que sobrevive al borrado (ADR-018 propuesto).
 *     `cms.audit_logs.account_id/user_id` son FK con `on delete set null`:
 *     al borrar a un miembro se perdía quién hizo qué. Se añaden las
 *     columnas `actor_user_id`, `actor_account_id` (sin FK) y `actor_email`,
 *     que rellena SIEMPRE el *trigger* `audit_logs_set_actor_snapshot` y que
 *     no cambian después; se rellenan también las entradas existentes. El
 *     correo solo se lee con `cms.get_audit_log_actor_email` (vista
 *     `cms.audit_logs_readable`).
 * B · `grant_admin_access` / `revoke_admin_access` devolvían `SQLERRM` en su
 *     resultado. Ahora devuelven solo códigos estables; el detalle va al log
 *     del servidor (`RAISE LOG`).
 * C · Auditoría que falla en cerrado. `insert_record`, `_update_record_impl`
 *     y `_delete_record_impl` ignoraban un fallo al escribir la entrada de
 *     auditoría y guardaban el cambio sin rastro. Ahora el fallo revierte la
 *     escritura (SQLSTATE `PKA01`).
 * D · Reglas de rango de los miembros: nadie cambia sus propios roles
 *     (`can_modify_account_role`), las cuentas raíz de ADR-014 no se
 *     desactivan ni cambian de rol desde el CMS (`is_root_managed_account`
 *     en `can_action_account`, `can_modify_account_role` y
 *     `set_account_active`, que además devuelve códigos estables) y solo una
 *     cuenta raíz con sesión aal2 puede desactivar `requires_mfa`
 *     (`guard_mfa_requirement_change`). Los cambios de configuración se
 *     auditan como `warning`.
 *
 * Nada es destructivo: columnas nuevas, funciones redefinidas con
 * `create or replace`, *triggers* nuevos y la vista ampliada por el final.
 *
 * Nota (bitácora B-35): `supabase db diff` no compara los privilegios por
 * columna ni `security_invoker`; esa parte se escribe a mano y la comprueba
 * `cms-members-hardening.test.sql`.
 *
 * [TFG] RF-09 · RF-10 · RNF-02 · ADR-014 · ADR-015.
 */

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- A · Instantánea del autor en cms.audit_logs
-- ---------------------------------------------------------------------------

alter table cms.audit_logs add column if not exists actor_user_id uuid;

alter table cms.audit_logs add column if not exists actor_account_id uuid;

alter table cms.audit_logs add column if not exists actor_email text;

comment on column cms.audit_logs.actor_user_id is
  'Instantánea del usuario de Auth que actuó (sin FK: se conserva aunque se borre el usuario)';

comment on column cms.audit_logs.actor_account_id is
  'Instantánea de la cuenta del CMS que actuó (sin FK: se conserva aunque se borre la cuenta)';

comment on column cms.audit_logs.actor_email is
  'Instantánea del correo de Auth de quien actuó, tomada al escribir la entrada';

-- Relleno de las entradas existentes ANTES de crear el *trigger*, que en
-- un UPDATE conserva la instantánea anterior (aquí vacía). Las entradas cuyo
-- autor ya se borró quedan sin instantánea: ese dato ya se había perdido.
update cms.audit_logs a
set actor_account_id = a.account_id,
    actor_user_id = coalesce(a.user_id,
                             (select acc.auth_user_id from cms.accounts acc where acc.id = a.account_id)),
    actor_email = (select u.email
                   from auth.users u
                   where u.id = coalesce(a.user_id,
                                         (select acc.auth_user_id from cms.accounts acc where acc.id = a.account_id)))
where a.actor_user_id is null
  and a.actor_account_id is null
  and (a.user_id is not null or a.account_id is not null);

-- Escrito a mano (B-35): lectura por columnas de los identificadores de la
-- instantánea; `actor_email` queda fuera a propósito.
grant select (actor_user_id, actor_account_id) on cms.audit_logs to authenticated;

create or replace function cms.audit_logs_set_actor_snapshot () returns trigger
language plpgsql
security definer
set
  search_path = '' as $$
begin
    if tg_op = 'UPDATE' then
        new.actor_user_id := old.actor_user_id;
        new.actor_account_id := old.actor_account_id;
        new.actor_email := old.actor_email;

        return new;
    end if;

    new.actor_account_id := new.account_id;
    new.actor_user_id := new.user_id;

    if new.actor_user_id is null and new.account_id is not null then
        select a.auth_user_id
        into new.actor_user_id
        from cms.accounts a
        where a.id = new.account_id;
    end if;

    new.actor_email := null;

    if new.actor_user_id is not null then
        select u.email
        into new.actor_email
        from auth.users u
        where u.id = new.actor_user_id;
    end if;

    return new;
end;
$$;

comment on function cms.audit_logs_set_actor_snapshot () is
  'Trigger: guarda en cada entrada de auditoría una instantánea inmutable de su autor (id de usuario, id de cuenta y correo)';

revoke all on function cms.audit_logs_set_actor_snapshot () from public, anon, authenticated, service_role;

create trigger audit_logs_set_actor_snapshot
  before insert or update on cms.audit_logs
  for each row
execute function cms.audit_logs_set_actor_snapshot ();

create or replace function cms.get_audit_log_actor_email (p_log_id uuid) returns text
language plpgsql
stable
security definer
cost 1000
set
  search_path = '' as $$
declare
    v_account_id uuid;
    v_email      text;
begin
    select a.account_id, a.actor_email
    into v_account_id, v_email
    from cms.audit_logs a
    where a.id = p_log_id;

    if not found or v_email is null then
        return null;
    end if;

    if not cms.is_mfa_compliant() or not cms.can_read_audit_log(v_account_id) then
        return null;
    end if;

    if not (cms.has_admin_permission('account'::cms.system_resource, 'select'::cms.system_action)
        or cms.has_admin_permission('auth_user'::cms.system_resource, 'select'::cms.system_action)) then
        return null;
    end if;

    return v_email;
end;
$$;

comment on function cms.get_audit_log_actor_email (uuid) is
  'Correo de la instantánea del autor de una entrada de auditoría, si la sesión puede ver la entrada y los miembros o usuarios';

revoke all on function cms.get_audit_log_actor_email (uuid) from public, anon;

grant execute on function cms.get_audit_log_actor_email (uuid) to authenticated, service_role;

-- La vista se amplía por el final (`create or replace view` no admite otra
-- cosa) y se repite `security_invoker` a mano (B-35).
create or replace view cms.audit_logs_readable
with
  (security_invoker = true) as
select
  a.id,
  a.created_at,
  a.account_id,
  a.user_id,
  a.operation,
  a.schema_name,
  a.table_name,
  d.record_id,
  d.old_data,
  d.new_data,
  coalesce(d.data_redacted, false) as data_redacted,
  a.severity,
  a.metadata,
  -- Instantánea del autor (F2.7a): se añade al final porque una vista solo
  -- admite columnas nuevas tras las existentes (`create or replace view`).
  a.actor_user_id,
  a.actor_account_id,
  cms.get_audit_log_actor_email (a.id) as actor_email
from
  cms.audit_logs a
  left join lateral cms.get_audit_log_row_data (a.id) d on true;

-- Los *grants* de la vista se conservan al redefinirla; se repiten para que
-- la intención quede escrita.
revoke all on cms.audit_logs_readable from anon, authenticated, service_role;

grant select on cms.audit_logs_readable to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- D · Cuentas raíz y guardia de requires_mfa (54-cms-members-hardening.sql)
-- ---------------------------------------------------------------------------

/*
 * cms.is_root_managed_account
 *
 * Devuelve `true` si la cuenta del CMS pertenece a un super-admin de la
 * plataforma (`app_metadata.role = 'super-admin'`) o tiene el rol de sistema
 * `Root` (marca `system_role = root`). Ese acceso lo gobierna la plataforma:
 * al dejar de ser super-admin se retira solo (ver `cms.revoke_root_access`),
 * así que el CMS no debe poder desactivar la cuenta ni cambiarle el rol.
 *
 * SECURITY DEFINER porque consulta `auth.users`, que los roles de la API no
 * pueden leer. Solo devuelve sí/no sobre una cuenta; que una cuenta tiene el
 * rol Root ya es visible para cualquier miembro del personal (políticas
 * `view_roles` y `view_account_roles`), así que no revela nada nuevo.
 */
create or replace function cms.is_root_managed_account (p_account_id uuid) returns boolean
language sql
stable
security definer
set
  search_path = '' as $$
    -- Sin acceso vigente al CMS no responde (evita usarla como oráculo de
    -- «¿es super-admin?»). Devolver `false` nunca abre nada: quien la usa
    -- como guardia (`guard_mfa_requirement_change`) exige `true`, y las
    -- demás (`can_action_account`…) ya deniegan sin acceso vigente.
    select cms.verify_admin_access() and (exists (select 1
                   from cms.accounts a
                            join auth.users u on u.id = a.auth_user_id
                   where a.id = p_account_id
                     and u.raw_app_meta_data ->> 'role' = 'super-admin')
        or exists (select 1
                   from cms.account_roles ar
                            join cms.roles r on r.id = ar.role_id
                   where ar.account_id = p_account_id
                     and r.metadata @> '{"system_role": "root"}'::jsonb));
$$;

comment on function cms.is_root_managed_account (uuid) is
  'Indica si una cuenta del CMS es raíz (super-admin de la plataforma o rol Root): no se desactiva ni cambia de rol desde el CMS';

revoke all on function cms.is_root_managed_account (uuid) from public, anon;

grant execute on function cms.is_root_managed_account (uuid) to authenticated, service_role;

/*
 * cms.guard_mfa_requirement_change (trigger BEFORE sobre cms.configuration)
 *
 * [TFG] RNF-02 · ADR-014 · F2.7a. `requires_mfa` decide si todo el personal
 * del CMS tiene que entrar con segundo factor. Desactivarlo rebaja la
 * seguridad de toda la consola, así que, además del permiso
 * `system_setting:update` que ya exige la política RLS de la tabla, solo
 * puede hacerlo:
 *
 *  - una sesión aal2 (quien la relaja ha demostrado su segundo factor), y
 *  - una cuenta raíz (`cms.is_root_managed_account`): un super-admin de la
 *    plataforma, no un administrador delegado del CMS.
 *
 * Volver a exigirlo (o borrar la fila, que el CMS interpreta como
 * «obligatorio», ver `cms.verify_admin_access`) no rebaja nada y no se
 * limita aquí. El cambio queda en la auditoría como aviso (`warning`) gracias
 * al *trigger* genérico de `50-cms-triggers.sql`.
 *
 * Es SECURITY INVOKER a propósito: se aplica a cualquier rol salvo los de
 * mantenimiento (`postgres`, `supabase_admin`), con los que escriben las
 * migraciones, el *seed* y los tests. Si fuera SECURITY DEFINER, `current_user` sería siempre el
 * propietario y la comprobación no distinguiría a quien llama.
 */
create or replace function cms.guard_mfa_requirement_change () returns trigger
language plpgsql
set
  search_path = '' as $$
begin
    -- Solo se salta para los roles de mantenimiento (migraciones, *seed*,
    -- tests); cualquier otro rol, incluido `service_role`, pasa la regla.
    -- Límite conocido: una función SECURITY DEFINER propiedad de `postgres`
    -- también se ejecutaría como `postgres`; hoy ninguna escribe en
    -- `cms.configuration`.
    if current_user in ('postgres', 'supabase_admin') then
        return new;
    end if;

    if new.key = 'requires_mfa' and lower(new.value) = 'false'
        and (tg_op = 'INSERT' or old.key <> 'requires_mfa' or lower(old.value) <> 'false') then
        if not cms.is_aal2()
            or not cms.is_root_managed_account(cms.get_current_user_account_id()) then
            raise exception 'MFA_DISABLE_REQUIRES_ROOT_AAL2'
                using errcode = 'insufficient_privilege';
        end if;
    end if;

    return new;
end;
$$;

comment on function cms.guard_mfa_requirement_change () is
  'Trigger: solo una cuenta raíz con sesión aal2 puede desactivar la obligación de MFA del CMS';

revoke all on function cms.guard_mfa_requirement_change () from public, anon, authenticated, service_role;

create trigger guard_mfa_requirement_change
  before insert or update on cms.configuration
  for each row
execute function cms.guard_mfa_requirement_change ();

-- ---------------------------------------------------------------------------
-- D · Reglas de rango en can_modify_account_role y can_action_account
-- ---------------------------------------------------------------------------

create or replace function cms.can_modify_account_role (
  p_account_id UUID,
  p_target_account_id UUID,
  p_role_id UUID,
  p_action cms.system_action
) RETURNS BOOLEAN SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_user_max_rank    INTEGER;
    v_role_rank        INTEGER;
    v_target_max_rank  INTEGER;
BEGIN
    -- Input validation
    IF p_account_id IS NULL OR p_target_account_id IS NULL OR p_role_id IS NULL OR p_action IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check if user has admin access (JWT validation)
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    -- First check: Does user have admin permission to modify roles at all?
    IF NOT cms.has_admin_permission('role'::cms.system_resource, p_action) THEN
        RETURN FALSE;
    END IF;

    -- [TFG] RNF-02 · F2.7a (pendiente D, reglas de rango). Nadie cambia sus
    -- propios roles: el código heredado permitía asignarse o quitarse roles de
    -- rango inferior al propio, es decir, degradarse o cambiar de perfil sin
    -- que nadie por encima lo decidiera. La gestión de roles es siempre una
    -- acción sobre OTRA cuenta.
    IF p_account_id = p_target_account_id THEN
        RETURN FALSE;
    END IF;

    -- Las cuentas raíz (super-admins de la plataforma, ADR-014) las gestiona
    -- el pegamento de `53-cms-super-admin.sql`, nunca el CMS. Hoy ya lo impide
    -- el rango (Root tiene 100, el máximo y único), pero la regla se escribe
    -- de forma explícita para no depender de esa coincidencia.
    IF cms.is_root_managed_account(p_target_account_id) THEN
        RETURN FALSE;
    END IF;

    -- CANONICAL LOCKING: Lock all resources in consistent order
    -- This prevents deadlocks regardless of caller order
    PERFORM cms.lock_resources_ordered(
            p_accounts := ARRAY [p_account_id, p_target_account_id]::UUID[],
            p_roles := ARRAY [p_role_id]::UUID[]
            );

    -- Get role rank (simple read)
    SELECT rank
    INTO v_role_rank
    FROM cms.roles
    WHERE id = p_role_id;

    IF v_role_rank IS NULL THEN
        RETURN FALSE; -- Role doesn't exist
    END IF;

    v_user_max_rank := coalesce(cms.get_user_max_role_rank(p_account_id), null);

    v_target_max_rank := coalesce(cms.get_user_max_role_rank(p_target_account_id), 0);

    -- If the user has no roles, return false
    IF v_user_max_rank IS NULL THEN
        RETURN FALSE;
    END IF;

    -- RULE 1: User must have STRICTLY HIGHER rank than the role being assigned/modified.
    -- Previously this allowed EQUAL rank ('<'), letting a rank-N admin grant a
    -- rank-N role to a subordinate and elevate it to co-equal top rank (which then
    -- became immune to the granting admin, since equal-rank actions are blocked
    -- everywhere else). Strict '<=' caps delegated grants at N-1, consistent with
    -- can_action_role / can_action_account. (Creating peer/top-rank admins is a
    -- privileged bootstrap operation performed via the service role / seed.)
    IF v_user_max_rank <= v_role_rank THEN
        RETURN FALSE;
    END IF;

    -- RULE 2: solo se actúa sobre cuentas de rango ESTRICTAMENTE inferior.
    RETURN v_user_max_rank > v_target_max_rank;
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in can_modify_account_role: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

create or replace function cms.can_action_account (
  p_target_account_id uuid,
  p_action cms.system_action
) RETURNS boolean SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_account_id            UUID;
    v_account_role_rank int;
    v_target_role_rank  int;
BEGIN
    -- Basic validation
    IF p_target_account_id IS NULL OR p_action IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Verify admin access and permissions
    IF NOT cms.has_admin_permission('account'::cms.system_resource, p_action) THEN
        RETURN FALSE;
    END IF;

    -- Nadie actúa sobre su propia cuenta con esta función (estado, roles,
    -- borrado): el código heredado tenía después un bloque de «auto
    -- modificación» que nunca se alcanzaba y se ha retirado.
    v_account_id := cms.get_current_user_account_id();
    IF v_account_id IS NULL OR v_account_id = p_target_account_id THEN
        RETURN FALSE;
    END IF;

    -- [TFG] RNF-02 · ADR-014 · F2.7a: las cuentas raíz (super-admins de la
    -- plataforma) no se gestionan desde el CMS. Lo garantiza también el rango
    -- (Root = 100, único), pero se comprueba de forma explícita.
    IF cms.is_root_managed_account(p_target_account_id) THEN
        RETURN FALSE;
    END IF;

    -- Get priorities (simple reads)
    v_account_role_rank := cms.get_user_max_role_rank(v_account_id);
    v_target_role_rank := coalesce(cms.get_user_max_role_rank(p_target_account_id), 0);

    -- Higher role rank can action lower rank accounts
    RETURN v_account_role_rank > v_target_role_rank;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- B y D · Acceso al CMS y estado de las cuentas con códigos estables
-- ---------------------------------------------------------------------------

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

comment on function cms.grant_admin_access (uuid) is
  'Da acceso al CMS a un usuario (claim cms_access y cuenta activa) con permiso account:insert y respetando rangos; devuelve un código de error estable';

comment on function cms.revoke_admin_access (uuid, boolean) is
  'Retira el acceso al CMS a un usuario con permiso account:delete y respetando rangos; devuelve un código de error estable';

-- ---------------------------------------------------------------------------
-- C · Auditoría que falla en cerrado en las escrituras del explorador
-- ---------------------------------------------------------------------------

create or replace function cms.insert_record (p_schema text, p_table text, p_data jsonb) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_sql                  text;
    v_result               jsonb;
    v_columns              text[] := '{}';
    v_values               text[] := '{}';
    v_column               text;
    v_value                jsonb;
    v_column_info          RECORD;
    v_audit_log_id         uuid;
    v_columns_config       jsonb;
    v_is_editable          boolean;
    v_non_editable_columns text[] := '{}';
    v_formatted_value      text;
    v_column_count         int    := 0;
    v_max_columns CONSTANT int    := 100; -- Security limit
BEGIN
    -- Security: Validate schema and table names
    p_schema := cms.sanitize_identifier(p_schema);
    p_table := cms.sanitize_identifier(p_table);

    -- Security: Check if schema is protected from write operations
    IF NOT cms.validate_schema_access(p_schema) THEN
        RAISE EXCEPTION 'Write operations are not allowed on protected schema: %. This schema is managed by Supabase and is critical to the functionality of your project.', p_schema
            USING ERRCODE = 'insufficient_privilege',
                HINT = 'You can only perform write operations on user-defined schemas';
    END IF;

    -- Security: Verify JWT claim
    IF NOT cms.verify_admin_access() THEN
        RAISE EXCEPTION 'Invalid admin access'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Security: Permission check
    IF NOT cms.has_data_permission('insert'::cms.system_action, p_schema, p_table) THEN
        RAISE EXCEPTION 'Permission denied for insert operation on %.%', p_schema, p_table
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Input validation
    IF p_data IS NULL OR jsonb_typeof(p_data) != 'object' THEN
        RAISE EXCEPTION 'Data must be a valid JSON object'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Check for empty data
    IF NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_data)) THEN
        RAISE EXCEPTION 'At least one column-value pair is required for insertion'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Security: Count columns
    SELECT COUNT(*) INTO v_column_count FROM jsonb_object_keys(p_data);

    IF v_column_count > v_max_columns THEN
        RAISE EXCEPTION 'Too many columns provided: %. Maximum allowed: %',
            v_column_count, v_max_columns
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Get columns configuration to check editability
    SELECT columns_config
    INTO v_columns_config
    FROM cms.table_metadata
    WHERE schema_name = p_schema
      AND table_name = p_table;

    -- Process each column with type safety and editability checks
    FOR v_column, v_value IN
        SELECT key, value FROM jsonb_each(p_data)
        LOOP
            -- Security: Validate column name
            IF v_column IS NULL OR length(v_column) = 0 OR length(v_column) > 63 THEN
                RAISE EXCEPTION 'Invalid column name: %', COALESCE(v_column, 'NULL')
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;

            -- Security: Verify column exists
            IF NOT cms.validate_column_name(p_schema, p_table, v_column) THEN
                RAISE EXCEPTION 'Column does not exist in table %.%: %', p_schema, p_table, v_column
                    USING ERRCODE = 'undefined_column';
            END IF;

            -- Security: a column is writable ONLY when table metadata explicitly
            -- marks it editable (fail closed). Columns on unsynced tables, or
            -- columns added after the last sync, have no metadata entry and must
            -- NOT be writable -- otherwise a client could mass-assign primary
            -- keys, ownership, audit or privilege columns it was never granted.
            v_is_editable := false;
            IF v_columns_config IS NOT NULL AND v_columns_config ? v_column THEN
                v_is_editable := COALESCE((v_columns_config -> v_column ->> 'is_editable')::boolean, false);
            END IF;

            IF NOT v_is_editable THEN
                v_non_editable_columns := array_append(v_non_editable_columns, v_column);
                CONTINUE;
            END IF;

            -- Get column metadata for type-safe formatting
            SELECT data_type,
                   udt_name,
                   udt_schema,
                   is_nullable
            INTO v_column_info
            FROM information_schema.columns
            WHERE table_schema = p_schema
              AND table_name = p_table
              AND column_name = v_column;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Column metadata not found for: %.%.%', p_schema, p_table, v_column
                    USING ERRCODE = 'undefined_column';
            END IF;

            -- Add column name to arrays
            v_columns := array_append(v_columns, quote_ident(v_column));

            -- Type-safe value formatting using our robust function
            BEGIN
                v_formatted_value := cms.format_typed_value(
                        v_value,
                        v_column_info.data_type,
                        v_column_info.udt_name,
                        v_column_info.udt_schema
                                     );

                v_values := array_append(v_values, v_formatted_value);

            EXCEPTION
                WHEN OTHERS THEN
                    RAISE EXCEPTION 'Failed to format value for column "%" of type %: %',
                        v_column, v_column_info.data_type, SQLERRM
                        USING ERRCODE = SQLSTATE,
                            HINT = format('Provided value: %s', COALESCE(v_value::text, 'NULL'));
            END;
        END LOOP;

    -- Warn if non-editable columns were skipped
    IF cardinality(v_non_editable_columns) > 0 THEN
        RAISE WARNING 'Skipped non-editable columns: %', array_to_string(v_non_editable_columns, ', ');
    END IF;

    -- If no editable columns were found, raise an exception
    IF cardinality(v_columns) = 0 THEN
        RAISE EXCEPTION 'No editable columns were provided for insertion'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Build and execute query safely
    v_sql := format(
            'INSERT INTO %I.%I (%s) VALUES (%s) RETURNING to_jsonb(%I.*)',
            p_schema,
            p_table,
            array_to_string(v_columns, ', '),
            array_to_string(v_values, ', '),
            p_table
             );

    BEGIN
        EXECUTE v_sql INTO v_result;
    EXCEPTION
        WHEN OTHERS THEN
            -- Enhanced error handling with context
            IF SQLSTATE = '23505' THEN
                RAISE EXCEPTION 'Unique constraint violation: A record with these values already exists in %.%',
                    p_schema, p_table
                    USING ERRCODE = 'unique_violation';
            ELSIF SQLSTATE = '23503' THEN
                RAISE EXCEPTION 'Foreign key constraint violation: Referenced record does not exist in %.%',
                    p_schema, p_table
                    USING ERRCODE = 'foreign_key_violation';
            ELSIF SQLSTATE = '23502' THEN
                RAISE EXCEPTION 'Not null constraint violation: Required field is missing in %.%',
                    p_schema, p_table
                    USING ERRCODE = 'not_null_violation';
            ELSE
                RAISE EXCEPTION 'Insert failed for table %.%: % (SQLSTATE: %)',
                    p_schema, p_table, SQLERRM, SQLSTATE
                    USING ERRCODE = SQLSTATE;
            END IF;
    END;

    -- [TFG] RF-10 · RNF-02 · Auditoría que falla en cerrado (F2.7a, pendiente
    -- de ADR-015). El código heredado capturaba cualquier error de esta
    -- llamada y seguía adelante: si la entrada de auditoría no se podía
    -- escribir, el cambio se guardaba igualmente SIN rastro. Ahora el fallo se
    -- anota en el log del servidor y se relanza con un SQLSTATE propio
    -- (`PKA01`, «no se pudo auditar»): el manejador del final de la función
    -- revierte TODO lo hecho en ella (el cambio incluido) y devuelve
    -- `success = false`; la API lo traduce a `RECORD_WRITE_FAILED` (500).
    BEGIN
        v_audit_log_id := cms.create_audit_log(
                'INSERT',
                p_schema,
                p_table,
                v_result ->> 'id',
                NULL,
                v_result
                          );
    EXCEPTION
        WHEN OTHERS THEN
            RAISE LOG 'Audit log write failed for insert: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
            RAISE EXCEPTION 'Audit log write failed'
                USING ERRCODE = 'PKA01';
    END;

    RETURN cms.build_crud_response(
            true,
            'insert'::cms.system_action,
            v_result,
            NULL,
            jsonb_build_object('audit_log_id', v_audit_log_id)
           );

EXCEPTION
    WHEN OTHERS THEN
        -- Enhanced error logging
        RAISE LOG 'insert_record failed - Schema: %, Table: %, Data: %, Error: %',
            p_schema, p_table, p_data::text, SQLERRM;

        RETURN cms.build_crud_response(
                false,
                'insert'::cms.system_action,
                NULL,
                SQLERRM,
                jsonb_build_object(
                        'sqlstate', SQLSTATE,
                        'schema', p_schema,
                        'table', p_table
                )
               );
END;
$$ LANGUAGE plpgsql;

create or replace function cms._update_record_impl (
  p_schema text,
  p_table text,
  p_where_clauses text[],
  p_data jsonb
) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_sql                  text;
    v_result               jsonb;
    v_old_data             jsonb;
    v_sets                 text[] := '{}';
    v_column               text;
    v_value                jsonb;
    v_column_info          RECORD;
    v_audit_log_id         uuid;
    v_columns_config       jsonb;
    v_is_editable          boolean;
    v_non_editable_columns text[] := '{}';
BEGIN
    IF NOT cms.verify_admin_access() THEN
        RAISE EXCEPTION 'Invalid admin access';
    END IF;

    -- Validate schema and table names
    p_schema := cms.sanitize_identifier(p_schema);
    p_table := cms.sanitize_identifier(p_table);

    -- Check if schema is protected
    IF NOT cms.validate_schema_access(p_schema) THEN
        RAISE EXCEPTION 'Write operations are not allowed on protected schema: %. This schema is managed by Supabase and is critical to the functionality of your project.', p_schema
            USING ERRCODE = 'insufficient_privilege',
                HINT = 'You can only perform write operations on user-defined schemas';
    END IF;

    -- Permission check
    IF NOT cms.has_data_permission('update'::cms.system_action, p_schema, p_table) THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;

    -- First fetch AND LOCK the current data for audit logging
    EXECUTE format(
            'SELECT to_jsonb(%I.*) FROM %I.%I WHERE %s FOR UPDATE', -- Added FOR UPDATE
            p_table, p_schema, p_table, array_to_string(p_where_clauses, ' AND ')
            ) INTO v_old_data;

    IF v_old_data IS NULL THEN
        RAISE EXCEPTION 'No record found matching the specified conditions in %.%', p_schema, p_table;
    END IF;

    -- Get columns configuration to check editability
    SELECT columns_config
    INTO v_columns_config
    FROM cms.table_metadata
    WHERE schema_name = p_schema
      AND table_name = p_table;

    -- Build SET clauses for update
    FOR v_column, v_value IN
        SELECT key, value FROM jsonb_each(p_data)
        LOOP
            -- Validate column name
            IF NOT cms.validate_column_name(p_schema, p_table, v_column) THEN
                RAISE EXCEPTION 'Invalid column: %', v_column;
            END IF;

            -- Security: a column is writable ONLY when table metadata explicitly
            -- marks it editable (fail closed). Without an explicit is_editable
            -- entry the column is treated as read-only, preventing mass-assignment
            -- of primary keys, ownership, audit or privilege columns on unsynced
            -- tables or columns added after the last sync.
            v_is_editable := false;

            IF v_columns_config IS NOT NULL AND v_columns_config ? v_column THEN
                v_is_editable := coalesce((v_columns_config -> v_column ->> 'is_editable')::boolean, false);
            END IF;

            -- Skip non-editable columns
            IF NOT v_is_editable THEN
                v_non_editable_columns := array_append(v_non_editable_columns, v_column);
                CONTINUE;
            END IF;

            -- Get column metadata for type-safe formatting
            SELECT data_type,
                   udt_name,
                   udt_schema
            INTO v_column_info
            FROM information_schema.columns
            WHERE table_schema = p_schema
              AND table_name = p_table
              AND column_name = v_column;

            -- Handle NULL values
            IF v_value IS NULL OR jsonb_typeof(v_value) = 'null' THEN
                v_sets := array_append(v_sets, quote_ident(v_column) || ' = NULL');
            ELSE
                -- Use the enhanced format_typed_value function for type safety
                BEGIN
                    DECLARE
                        v_formatted_value text;
                    BEGIN
                        v_formatted_value := cms.format_typed_value(
                                v_value,
                                v_column_info.data_type,
                                v_column_info.udt_name,
                                v_column_info.udt_schema
                                             );

                        v_sets := array_append(
                                v_sets,
                                format('%I = %s', v_column, v_formatted_value)
                                  );
                    END;

                EXCEPTION
                    WHEN OTHERS THEN
                        RAISE EXCEPTION 'Failed to format value for column "%" of type %: %',
                            v_column, v_column_info.data_type, SQLERRM
                            USING ERRCODE = SQLSTATE,
                                HINT = format('Provided value: %s', COALESCE(v_value::text, 'NULL'));
                END;
            END IF;
        END LOOP;

    -- Warn if non-editable columns were skipped
    IF cardinality(v_non_editable_columns) > 0 THEN
        RAISE WARNING 'Skipped non-editable columns: %', array_to_string(v_non_editable_columns, ', ');
    END IF;

    -- If no editable columns were found, return the original data
    IF cardinality(v_sets) = 0 THEN
        RETURN cms.build_crud_response(
                true, -- Or false, depending on if this is considered a "successful no-op"
                'update'::cms.system_action,
                v_old_data,
                'No editable columns provided or all values matched existing data.', -- Optional message
                NULL
               );
    END IF;

    -- Build and execute query safely
    v_sql := format(
            'UPDATE %I.%I SET %s WHERE %s RETURNING to_jsonb(%I.*)',
            p_schema,
            p_table,
            array_to_string(v_sets, ', '),
            array_to_string(p_where_clauses, ' AND '),
            p_table
             );

    BEGIN
        EXECUTE v_sql INTO v_result;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Error updating record: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    END;

    -- [TFG] RF-10 · RNF-02 · Auditoría que falla en cerrado (F2.7a, pendiente
    -- de ADR-015). El código heredado capturaba cualquier error de esta
    -- llamada y seguía adelante: si la entrada de auditoría no se podía
    -- escribir, el cambio se guardaba igualmente SIN rastro. Ahora el fallo se
    -- anota en el log del servidor y se relanza con un SQLSTATE propio
    -- (`PKA01`, «no se pudo auditar»): el manejador del final de la función
    -- revierte TODO lo hecho en ella (el cambio incluido) y devuelve
    -- `success = false`; la API lo traduce a `RECORD_WRITE_FAILED` (500).
    BEGIN
        v_audit_log_id := cms.create_audit_log(
                'UPDATE',
                p_schema,
                p_table,
                v_result ->> 'id',
                v_old_data,
                v_result
                          );
    EXCEPTION
        WHEN OTHERS THEN
            RAISE LOG 'Audit log write failed for update: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
            RAISE EXCEPTION 'Audit log write failed'
                USING ERRCODE = 'PKA01';
    END;

    RETURN cms.build_crud_response(
            true,
            'update'::cms.system_action,
            v_result,
            NULL,
            NULL
           );
EXCEPTION
    WHEN OTHERS THEN
        RETURN cms.build_crud_response(
                false,
                'update'::cms.system_action,
                NULL,
                SQLERRM,
                jsonb_build_object('sqlstate', SQLSTATE)
               );
END;
$$ LANGUAGE plpgsql;

create or replace function cms._delete_record_impl (
  p_schema text,
  p_table text,
  p_where_clauses text[]
) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_sql          text;
    v_exists       boolean;
    v_old_data     jsonb;
    v_record_id    text := NULL;
    v_audit_log_id uuid;
BEGIN
    -- Validate schema and table names
    p_schema := cms.sanitize_identifier(p_schema);
    p_table := cms.sanitize_identifier(p_table);

    -- Check if schema is protected
    IF NOT cms.validate_schema_access(p_schema) THEN
        RAISE EXCEPTION 'Write operations are not allowed on protected schema: %. This schema is managed by Supabase and is critical to the functionality of your project.', p_schema
            USING ERRCODE = 'insufficient_privilege',
                HINT = 'You can only perform write operations on user-defined schemas';
    END IF;

    -- JWT and permission checks
    IF NOT cms.verify_admin_access() THEN
        RAISE EXCEPTION 'Invalid admin access';
    END IF;

    IF NOT cms.has_data_permission('delete'::cms.system_action, p_schema, p_table) THEN
        RAISE EXCEPTION 'The user does not have permission to delete this record';
    END IF;

    -- First fetch AND LOCK the current data for audit logging
    EXECUTE format(
            'SELECT to_jsonb(%I.*) FROM %I.%I WHERE %s FOR UPDATE', -- Added FOR UPDATE
            p_table, p_schema, p_table, array_to_string(p_where_clauses, ' AND ')
            ) INTO v_old_data;

    -- If the record is not found, return a proper error response
    IF v_old_data IS NULL THEN
        RETURN cms.build_crud_response(
                false,
                'delete'::cms.system_action,
                NULL,
                'Record not found.',
                jsonb_build_object('affected_rows', 0)
               );
    END IF;

    -- Extract ID for audit log if available
    v_record_id := v_old_data ->> 'id';

    -- Perform the deletion
    v_sql := format('DELETE FROM %I.%I WHERE %s',
                    p_schema, p_table, array_to_string(p_where_clauses, ' AND '));

    BEGIN
        EXECUTE v_sql;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Error deleting record: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    END;

    -- [TFG] RF-10 · RNF-02 · Auditoría que falla en cerrado (F2.7a, pendiente
    -- de ADR-015). El código heredado capturaba cualquier error de esta
    -- llamada y seguía adelante: si la entrada de auditoría no se podía
    -- escribir, el cambio se guardaba igualmente SIN rastro. Ahora el fallo se
    -- anota en el log del servidor y se relanza con un SQLSTATE propio
    -- (`PKA01`, «no se pudo auditar»): el manejador del final de la función
    -- revierte TODO lo hecho en ella (el cambio incluido) y devuelve
    -- `success = false`; la API lo traduce a `RECORD_WRITE_FAILED` (500).
    BEGIN
        v_audit_log_id := cms.create_audit_log(
                'DELETE',
                p_schema,
                p_table,
                v_record_id,
                v_old_data,
                NULL
                          );
    EXCEPTION
        WHEN OTHERS THEN
            RAISE LOG 'Audit log write failed for delete: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
            RAISE EXCEPTION 'Audit log write failed'
                USING ERRCODE = 'PKA01';
    END;

    RETURN jsonb_build_object(
            'success', true,
            'action', 'delete',
            'data', v_old_data, -- Return what was deleted
            'meta', jsonb_build_object(
                    'affected_rows', 1,
                    'audit_log_id', v_audit_log_id
                    )
           );
EXCEPTION
    WHEN OTHERS THEN
        RETURN cms.build_crud_response(
                false,
                'delete'::cms.system_action,
                NULL,
                SQLERRM,
                jsonb_build_object('sqlstate', SQLSTATE)
               );
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Auditoría de la configuración como aviso (50-cms-triggers.sql)
-- ---------------------------------------------------------------------------

create or replace function cms.audit_trigger_function () returns trigger
set
  row_security = off
set
  search_path = '' as $$
declare
    v_operation   text;
    v_old_data    jsonb;
    v_new_data    jsonb;
    v_record_id   text;
    v_record_json jsonb;
begin
    -- Determine operation type and get record data
    if TG_OP = 'DELETE' then
        v_operation := 'DELETE';
        v_old_data := to_jsonb(OLD);
        v_new_data := null;
        v_record_json := v_old_data;
    elsif TG_OP = 'UPDATE' then
        v_operation := 'UPDATE';
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
        v_record_json := v_new_data;
    elsif TG_OP = 'INSERT' then
        v_operation := 'INSERT';
        v_old_data := null;
        v_new_data := to_jsonb(NEW);
        v_record_json := v_new_data;
    end if;

    -- Generate record ID based on table structure
    -- For tables with single 'id' primary key
    if v_record_json ? 'id' then
        v_record_id := (v_record_json ->> 'id')::text;
    else
        -- For tables with composite primary keys, create a combined ID
        case TG_TABLE_NAME
            when 'account_roles'
                then v_record_id := (v_record_json ->> 'account_id') || '|' || (v_record_json ->> 'role_id');
            when 'role_permissions'
                then v_record_id := (v_record_json ->> 'role_id') || '|' || (v_record_json ->> 'permission_id');
            when 'account_permissions'
                then v_record_id := (v_record_json ->> 'account_id') || '|' || (v_record_json ->> 'permission_id');
            when 'permission_group_permissions'
                then v_record_id := (v_record_json ->> 'group_id') || '|' || (v_record_json ->> 'permission_id');
            when 'role_permission_groups'
                then v_record_id := (v_record_json ->> 'role_id') || '|' || (v_record_json ->> 'group_id');
            when 'dashboard_role_shares'
                then v_record_id := (v_record_json ->> 'dashboard_id') || '|' || (v_record_json ->> 'role_id');
            when 'configuration'
                then v_record_id := (v_record_json ->> 'key');
            when 'table_metadata'
                then v_record_id := (v_record_json ->> 'schema_name') || '|' || (v_record_json ->> 'table_name');
            else -- Fallback: use all non-null fields as record ID
            v_record_id := v_record_json::text;
            end case;
    end if;

    -- Create audit log entry
    perform cms.create_audit_log(
            p_operation := v_operation,
            p_schema := TG_TABLE_SCHEMA,
            p_table := TG_TABLE_NAME,
            p_record_id := v_record_id,
            p_old_data := v_old_data,
            p_new_data := v_new_data,
            -- [TFG] RNF-02 · F2.7a: los cambios de configuración global (por
            -- ejemplo, quitar la obligación de MFA) son cambios de seguridad y
            -- se registran como aviso para que destaquen en el registro.
            p_severity := case
                              when TG_TABLE_SCHEMA = 'cms' and TG_TABLE_NAME = 'configuration'
                                  then 'warning'::cms.audit_log_severity
                              else 'info'::cms.audit_log_severity
                          end,
            p_metadata := jsonb_build_object(
                    'trigger_name', TG_NAME,
                    'trigger_when', TG_WHEN,
                    'trigger_level', TG_LEVEL
                          )
            );

    -- Return appropriate record
    if TG_OP = 'DELETE' then
        return OLD;
    else
        return NEW;
    end if;
end;
$$ language plpgsql security definer;
