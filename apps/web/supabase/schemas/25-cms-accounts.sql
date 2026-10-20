
/*
 * -------------------------------------------------------
 * Sección: Cuentas del CMS
 * Vincula un usuario de Supabase Auth con una cuenta del panel de
 * administración. Tener cuenta activa aquí es uno de los requisitos para
 * entrar en el CMS (ver cms.verify_admin_access); el rol y los permisos de
 * esa cuenta se definen en los ficheros siguientes.
 * -------------------------------------------------------
 */
create table if not exists cms.accounts (
  id UUID primary key default gen_random_uuid (),
  auth_user_id UUID not null unique references auth.users (id) on delete CASCADE,
  created_at TIMESTAMPTZ not null default NOW(),
  updated_at TIMESTAMPTZ not null default NOW(),
  is_active BOOLEAN not null default true,
  -- Datos de perfil de la cuenta (nombre de usuario, avatar...).
  metadata JSONB not null default '{
      "username": "",
      "picture_url": ""
    }'::jsonb check (jsonb_typeof(metadata) = 'object'),
  -- Preferencias de la interfaz (zona horaria, idioma...).
  preferences JSONB not null default '{
      "timezone": "",
      "language": "en-US"
    }'::jsonb check (jsonb_typeof(preferences) = 'object')
);

comment on table cms.accounts is 'Table to store the accounts';

comment on column cms.accounts.id is 'The ID of the account';

comment on column cms.accounts.auth_user_id is 'The ID of the auth user';

comment on column cms.accounts.created_at is 'The creation time of the account';

comment on column cms.accounts.updated_at is 'The last update time of the account';

comment on column cms.accounts.is_active is 'Whether the account is active. Protected field - cannot be updated directly by users.';

comment on column cms.accounts.auth_user_id is 'The ID of the auth user. Protected field - cannot be updated directly by users.';

comment on column cms.accounts.metadata is 'The metadata of the account. Can be updated by account owners and authorized admins.';

comment on column cms.accounts.preferences is 'The preferences of the account. Can be updated by account owners and authorized admins.';

-- Función `cms.auth_user_has_active_account`: indica si el usuario tiene una
-- cuenta del CMS activa.
-- get_current_user_account_id es `security invoker` y lee cms.accounts bajo
-- una política que depende de verify_admin_access, así que verify_admin_access
-- no puede usarla para comprobar si la cuenta sigue activa (sería circular).
-- Esta función `security definer` rompe ese ciclo; solo devuelve un booleano.
create or replace function cms.auth_user_has_active_account (p_auth_user_id uuid) RETURNS boolean STABLE security definer
set
  row_security = off
set
  search_path = '' as $$
    select exists (select 1
                   from cms.accounts
                   where auth_user_id = p_auth_user_id
                     and is_active = true);
$$ language sql;

grant
execute on function cms.auth_user_has_active_account (uuid) to authenticated;

-- Permisos de tabla: SELECT, INSERT y DELETE para usuarios autenticados (la RLS
-- decide sobre qué filas).
grant
select
,
  insert,
delete on table cms.accounts to authenticated,
service_role;

-- Permiso UPDATE por columnas: solo los campos inocuos (perfil, preferencias y
-- marca de tiempo). Quedan protegidos los sensibles, como is_active y
-- auth_user_id, para que nadie pueda reactivarse ni apropiarse de otra cuenta.
grant UPDATE (
  metadata,        -- User profile information - safe to update
  preferences,     -- User settings - safe to update  
  updated_at       -- Timestamp - safe to update
) on table cms.accounts to authenticated;

-- Solo service_role puede activar o desactivar cuentas.
grant UPDATE (
  is_active
) on table cms.accounts to service_role;

-- RLS activada; las políticas están en 39-cms-account-rls.sql.
alter table cms.accounts ENABLE row LEVEL SECURITY;

-- Función `cms.prevent_active_status_update_by_user`: segunda barrera que
-- impide que un usuario cambie su propio estado de activación.
create or replace function cms.prevent_active_status_update_by_user () RETURNS TRIGGER
set
  search_path = '' as $$
BEGIN
    if (select auth.uid()) = NEW.auth_user_id then
        RAISE EXCEPTION 'User cannot update their own active status';
    end if;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Se dispara solo cuando el UPDATE toca la columna is_active.
create trigger prevent_active_status_update_by_user before
update of is_active on cms.accounts for each row
execute function cms.prevent_active_status_update_by_user ();

-- Función `cms.update_user_preferences`: actualiza las preferencias de la
-- cuenta del usuario actual.
create or replace function cms.update_user_preferences (p_preferences JSONB) RETURNS jsonb
set
  search_path = '' as $$
DECLARE
    v_old_preferences jsonb;
BEGIN
    -- Get old preferences
    SELECT preferences
    INTO v_old_preferences
    FROM cms.accounts
    WHERE auth_user_id = (select auth.uid());

    -- Update
    UPDATE cms.accounts
    SET preferences = p_preferences
    WHERE auth_user_id = (select auth.uid());

    RETURN jsonb_build_object(
            'success', true,
            'action', 'update',
            'data', jsonb_build_object(
                    'old_preferences', v_old_preferences,
                    'new_preferences', p_preferences
                    )
           );
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.update_user_preferences (JSONB) to authenticated;

-- Función `cms.get_current_user_account_id`: devuelve el id de la cuenta del
-- CMS del usuario actual.
create or replace function cms.get_current_user_account_id () RETURNS uuid LANGUAGE plpgsql
set
  search_path = '' as $$
BEGIN
    RETURN (SELECT id from cms.accounts where (select auth.uid()) = auth_user_id and is_active = true);
END;
$$;

grant
execute on function cms.get_current_user_account_id () to authenticated;