
/*
 * -------------------------------------------------------
 * Sección: Autenticación del CMS
 * Funciones que deciden si el usuario actual puede entrar en el panel de
 * administración: indicador `cms_access` en el JWT, cuenta del CMS activa y
 * cumplimiento de la MFA. `cms.verify_admin_access()` es el punto de control
 * común que reutilizan las políticas RLS y las funciones del CMS.
 * -------------------------------------------------------
 */

/*
 * cms.is_aal2
 * Indica si la sesión actual tiene nivel de garantía `aal2` (segundo factor
 * verificado).
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

-- Se concede a authenticated porque la usan las políticas RLS.
grant
execute on function cms.is_aal2 () to authenticated;

/*
 * cms.is_mfa_compliant
 * Indica si la sesión cumple los requisitos de MFA: si el usuario tiene algún
 * factor verificado, su sesión debe ser `aal2`; si no, basta con `aal1`.
 * Es `security definer` (y desactiva la RLS) porque necesita leer
 * auth.mfa_factors, a la que authenticated no tiene acceso; solo consulta los
 * factores del propio auth.uid().
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

-- Se concede a authenticated porque la usan las políticas RLS.
grant
execute on function cms.is_mfa_compliant () to authenticated;

-- Función `cms.account_has_admin_access`: comprobación barata del indicador
-- `cms_access` en `app_metadata` del JWT. Ese campo solo lo puede escribir el
-- servidor, pero el indicador por sí solo no basta (ver verify_admin_access).
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

-- Función `cms.verify_admin_access`: decide si el usuario puede usar el CMS.
-- Primero mira el indicador del JWT (filtro barato), después que su cuenta
-- del CMS esté activa y, por último, que cumpla la MFA según la
-- configuración. Los permisos concretos sobre cada recurso se comprueban
-- después con cms.has_data_permission y cms.has_admin_permission.
-- No es `security definer`: se evalúa con los permisos del usuario.
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

    -- [TFG] RNF-02 · Endurecimiento F2.6 (bitácora B-34). Quien tiene un factor
    -- MFA verificado tiene que haber entrado con él (aal2), valga lo que valga
    -- `requires_mfa`. Antes, con `requires_mfa = 'false'`, un usuario con
    -- factor y sesión aal1 (solo contraseña) pasaba esta comprobación: las
    -- políticas RESTRICTIVE de las tablas le ocultaban las filas, pero las
    -- funciones `security definer` que confían en esta función (búsqueda
    -- global, escrituras del explorador, auditoría…) seguían adelante. Es la
    -- misma regla que `cms.is_mfa_compliant()` aplica en las políticas, ahora
    -- también en el punto de control común.
    if not cms.is_mfa_compliant() then
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
        -- Valor sospechoso: se anota solo en el log del servidor (`raise log`).
        -- Un `raise warning` llegaría al cliente como aviso del protocolo con
        -- un dato de configuración interno (bitácora B-33).
        raise log 'Invalid requires_mfa configuration value: %', requires_mfa;
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