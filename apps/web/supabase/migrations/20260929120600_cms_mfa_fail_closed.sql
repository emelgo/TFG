/*
 * Corrección de seguridad (PymeKit, F2.1): la comprobación de MFA del CMS
 * fallaba en abierto para usuarios con MFA configurado que entraban sin
 * segundo factor. Ver el comentario de cms.get_mfa_requirement() en
 * schemas/23-cms-auth.sql y los tests de cms-super-admin-root.test.sql.
 */

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

    -- Validate requires_mfa value to ensure it's either 'true' or 'false'.
    -- A missing (NULL) configuration means MFA is optional (the product default);
    -- only an explicit invalid value conservatively defaults to requiring MFA.
    if requires_mfa is not null and requires_mfa not in ('true', 'false') then
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
