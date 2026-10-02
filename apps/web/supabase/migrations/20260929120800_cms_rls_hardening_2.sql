/*
 * Segunda ronda de endurecimiento del CMS (PymeKit, F2.1), resultado de la
 * refutación independiente de /rls-review (ADR-015):
 *  1. validate_schema_access bloquea los esquemas del sistema `pg_*`
 *     (pg_catalog.pg_authid exponía hashes de contraseña de roles).
 *  2. view_role_permissions: se corrige una condición tautológica.
 */

create or replace function cms.validate_schema_access (p_schema text) RETURNS boolean
set
  search_path = '' as $$
DECLARE
    v_protected_schemas text[] := ARRAY [
        'auth',
        'cron',
        'extensions',
        'information_schema',
        'net',
        'pgsodium',
        'pgsodium_masks',
        'pgbouncer',
        'pgtle',
        'realtime',
        'storage',
        'supabase_functions',
        'supabase_migrations',
        'vault',
        'graphql',
        'graphql_public',
        'pgmq_public',
        'cms'
        ];
BEGIN
    -- Check if the schema is in the protected list
    IF p_schema = ANY (v_protected_schemas) THEN
        RETURN false;
    END IF;

    -- [TFG] RNF-02 · Corrección de PymeKit (hallada en la refutación de
    -- /rls-review): la lista heredada no incluía los catálogos del sistema.
    -- Con un permiso comodín (Root), `pg_catalog.pg_authid` devolvía los hashes
    -- de contraseña de los roles de Postgres. Se bloquea cualquier esquema
    -- `pg_*` (pg_catalog, pg_toast, pg_temp_N…), reservados por PostgreSQL.
    IF p_schema IS NULL OR p_schema LIKE 'pg\_%' THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

drop policy if exists view_role_permissions on cms.role_permissions;

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
