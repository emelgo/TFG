-- SECTION: CAN ACTION ROLE
-- In this section, we define the can action role function. This function is used to check if a user can modify a role. Uses SECURITY DEFINER to avoid infinite loops when the function is used within RLS policies.
create or replace function cms.can_action_role (p_role_id UUID, p_action cms.system_action) RETURNS BOOLEAN VOLATILE SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_current_user_max_rank INTEGER;
    v_target_role_rank      INTEGER;
    v_current_account_id        UUID;
BEGIN
    -- Basic validations
    IF p_role_id IS NULL OR p_action IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check if user has admin access
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    -- Check basic admin permission
    IF NOT cms.has_admin_permission('role'::cms.system_resource, p_action) THEN
        RETURN FALSE;
    END IF;

    v_current_account_id := cms.get_current_user_account_id();
    IF v_current_account_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Get target role rank (simple read)
    SELECT rank
    INTO v_target_role_rank
    FROM cms.roles
    WHERE id = p_role_id;

    IF v_target_role_rank IS NULL THEN
        RETURN FALSE; -- Role doesn't exist
    END IF;

    -- Get user's max rank
    v_current_user_max_rank := cms.get_user_max_role_rank(v_current_account_id);

    -- Simple comparison - user must have STRICTLY higher rank
    RETURN COALESCE(v_current_user_max_rank > v_target_role_rank, FALSE);
END;
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.can_action_role to authenticated;

-- SECTION: CAN MODIFY ACCOUNT ROLE
-- This function checks if a user can modify the role of a specific account with proper privilege escalation prevention. Uses SECURITY DEFINER to avoid infinite loops when the function is used within RLS policies.
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

    -- [TFG] RNF-02 · ADR-015 (F2.7b): la cuenta que actúa es SIEMPRE la de
    -- la sesión. La función es `security definer` y recibía al actor como
    -- parámetro, así que cualquiera podía preguntar «¿podría Root asignar
    -- este rol a esta cuenta?». Las políticas ya la llaman con
    -- `get_current_user_account_id()`.
    IF p_account_id IS DISTINCT FROM cms.get_current_user_account_id() THEN
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
    -- de forma explícita para no depender de esa coincidencia. Versión
    -- interna (B-47): la pública no responde sobre otras cuentas a quien no
    -- tiene `account:select`, y esta guardia debe aplicarse siempre.
    IF cms.account_is_root_managed(p_target_account_id) THEN
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

-- Grant execute permissions
grant
execute on FUNCTION cms.can_modify_account_role to authenticated;

-- Indexes
create index idx_account_roles_account_id on cms.account_roles (account_id);

create index idx_account_roles_role_id on cms.account_roles (role_id);

/*
 * cms.account_has_role
 *
 * Indica si una cuenta tiene un rol vigente. La usan las políticas de las
 * vistas guardadas compartidas por rol (`43-cms-saved-views-rls.sql`).
 *
 * [TFG] RNF-02 · ADR-015 (pendiente cerrado en F2.7b): es `security
 * definer` y aceptaba cualquier cuenta, así que cualquier usuario
 * autenticado podía averiguar el rol de otra cuenta probando ids. Ahora
 * exige acceso al CMS y solo responde sobre la cuenta de la sesión, salvo a
 * quien ya puede consultar las cuentas (`account:select`), que ve esos roles
 * en Ajustes > Miembros de todas formas.
 */
create or replace function cms.account_has_role (p_account_id UUID, p_role_id UUID) RETURNS BOOLEAN SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
BEGIN
    IF p_account_id IS NULL OR p_role_id IS NULL OR NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    IF p_account_id IS DISTINCT FROM cms.get_current_user_account_id()
        AND NOT cms.has_admin_permission('account'::cms.system_resource, 'select'::cms.system_action) THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (SELECT 1
                   FROM cms.account_roles
                   WHERE account_id = p_account_id
                     AND role_id = p_role_id
                     AND (valid_until IS NULL OR valid_until > NOW()));
END;
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.account_has_role to authenticated,
service_role;

-- SECTION: GET CURRENT USER ROLE
-- In this section, we define the function to get the current user's role.
--
create or replace function cms.get_current_user_role () RETURNS cms.roles LANGUAGE plpgsql
set
  search_path = '' as $$
DECLARE
    v_role cms.roles;
BEGIN
    SELECT r.*
    INTO v_role
    FROM cms.roles r
             JOIN cms.account_roles ar ON r.id = ar.role_id
    WHERE ar.account_id = cms.get_current_user_account_id()
    LIMIT 1;

    RETURN v_role;
END;
$$;

grant execute on FUNCTION cms.get_current_user_role to authenticated;