
/*
 * cms.is_aal2
 * Check if the user has aal2 access
 */
create or replace function cms.is_aal2 () returns boolean
set
  search_path = '' as $$
declare
    is_aal2 boolean;
begin
    select auth.jwt() ->> 'aal' = 'aal2' into is_aal2;

    return coalesce(is_aal2, false);
end
$$ language plpgsql;

-- Grant access to the function to authenticated users
grant
execute on function cms.is_aal2 () to authenticated;

/*
 * cms.is_mfa_compliant
 * Check if the user meets MFA requirements if they have MFA enabled.
 * If the user has MFA enabled, then the user must have aal2 enabled. Otherwise, the user must have aal1 enabled (default behavior).
 */
create or replace function cms.is_mfa_compliant () returns boolean
set
  row_security = off
set
  search_path = '' as $$
begin
    return array [(select auth.jwt() ->> 'aal')] <@ (select case
                                                                when count(id) > 0 then array ['aal2']
                                                                else array ['aal1', 'aal2']
                                                                end as aal
                                                     from auth.mfa_factors
                                                     where ((select auth.uid()) = auth.mfa_factors.user_id)
                                                       and auth.mfa_factors.status = 'verified');
end
$$ language plpgsql security definer;

-- Grant access to the function to authenticated users
grant
execute on function cms.is_mfa_compliant () to authenticated;

-- Lightweight function that checks if user has admin_access flag in JWT
create or replace function cms.account_has_admin_access () returns boolean
set
  search_path = '' as $$
begin
    return (auth.jwt() ->> 'app_metadata')::jsonb ->> 'cms_access' = 'true';
end
$$ language plpgsql;

grant
execute on function cms.account_has_admin_access () to authenticated;

-- `cms.auth_user_has_active_account` se define en 25-cms-accounts.sql, justo
-- después de `cms.accounts`: es una función `language sql` y PostgreSQL valida
-- su cuerpo al crearla, así que la tabla tiene que existir antes.

-- [TFG] RNF-02 · Corrección de seguridad de PymeKit (fallo heredado).
-- Devuelve el valor de la opción `requires_mfa` sin depender de lo que el
-- usuario pueda ver. `cms.configuration` tiene una política restrictiva que
-- oculta sus filas a quien tiene MFA configurado pero ha entrado sin segundo
-- factor (aal1). Si `verify_admin_access` leyera la opción con los permisos
-- del usuario, justo en ese caso la vería vacía, la interpretaría como «MFA
-- opcional» y dejaría pasar: el control fallaría en abierto. Por eso esta
-- lectura concreta se hace como `security definer` (con los permisos del
-- propietario), y solo devuelve esta opción, que no es un dato sensible.
create or replace function cms.get_mfa_requirement () returns text
language sql
stable
security definer
set
  search_path = '' as $$
    select value from cms.configuration where key = 'requires_mfa';
$$;

revoke all on function cms.get_mfa_requirement () from public, anon;

grant execute on function cms.get_mfa_requirement () to authenticated, service_role;

-- SECTION: CHECK ADMIN ACCESS
-- In this section, we define the check admin access function. This function is used to check if the user has admin access by checking the app_metadata of the JWT. This is a preliminary, cheap way to check if the user has admin access. Remaining checks are that using cms.has_data_permission and cms.has_admin_permission.
-- In addition, it checks if the user has MFA enabled and if MFA is required for admin access.
create or replace function cms.verify_admin_access () RETURNS boolean
set
  search_path = '' as $$
declare
    v_auth_user_id   uuid;
    has_admin_access boolean;
    requires_mfa     text;
    has_mfa          boolean;
begin
    -- Check if user has admin access flag in JWT
    select cms.account_has_admin_access() into has_admin_access;

    -- Early return if user doesn't have admin access
    if not coalesce(has_admin_access, false) then
        return false;
    end if;

    v_auth_user_id := (select auth.uid());

    -- The JWT claim survives deactivation (GoTrue re-mints app_metadata on every
    -- refresh), so the claim alone is not proof of access.
    if v_auth_user_id is null or not cms.auth_user_has_active_account(v_auth_user_id) then
        return false;
    end if;

    -- Get MFA requirement from configuration
    -- Se lee con cms.get_mfa_requirement() para no fallar en abierto (ver arriba).
    select lower(cms.get_mfa_requirement()) into requires_mfa;

    -- [TFG] ADR-014 · En PymeKit el MFA es obligatorio salvo que se desactive
    -- de forma explícita (requires_mfa = 'false'). Una opción ausente (NULL)
    -- o con un valor no válido se trata como «obligatorio»: si alguien borra
    -- la fila de configuración, el control falla en cerrado, no en abierto.
    if requires_mfa is null then
        requires_mfa := 'true';
    elsif requires_mfa not in ('true', 'false') then
        -- Log suspicious configuration value
        raise warning 'Invalid requires_mfa configuration value: %', requires_mfa;
        -- Default to requiring MFA for security
        requires_mfa := 'true';
    end if;

    -- Handle MFA check based on configuration
    if requires_mfa = 'true' then
        -- MFA is required, check if user has aal2 access
        select cms.is_aal2() into has_mfa;
    else
        -- MFA is not required or not configured, allow access
        has_mfa := true;
    end if;

    -- Return true only if user has admin access AND meets MFA requirements
    return coalesce(has_mfa, false);
end
$$ language plpgsql;

grant
execute on function cms.verify_admin_access () to authenticated;