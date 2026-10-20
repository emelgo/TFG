
/*
 * -------------------------------------------------------
 * Sección: Disparadores del CMS
 * Mantiene `updated_at` en todas las tablas del CMS y audita
 * automáticamente cada cambio en las tablas sensibles (roles, permisos,
 * grupos, asignaciones, configuración, metadatos y cuentas). Al hacerlo con
 * disparadores, el rastro queda aunque la escritura no pase por las
 * funciones del CMS (por ejemplo, si la API escribe con Drizzle).
 * -------------------------------------------------------
 */

-- Bloque que añade el disparador de `updated_at` a todas las tablas del CMS
-- que tienen esa columna.
do $$
    DECLARE
        t text;
    BEGIN
        FOR t IN
            SELECT table_name
            FROM information_schema.columns
            WHERE table_schema = 'cms'
              AND column_name = 'updated_at'
            LOOP
                EXECUTE format('
            CREATE TRIGGER update_%I_timestamp
            BEFORE UPDATE ON cms.%I
            FOR EACH ROW
            EXECUTE FUNCTION cms.update_updated_at_column();
        ', t, t);
            END LOOP;
    END;
$$;

-- Sección: disparadores de auditoría de permisos, roles y grupos.
-- Función de disparador genérica: escribe en cms.audit_logs la operación, la
-- tabla y los datos antes y después del cambio. Sirve para cualquier tabla,
-- tenga clave primaria simple o compuesta.
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

-- Auditoría de cms.roles.
create trigger roles_audit_insert_trigger
after insert on cms.roles for each row
execute function cms.audit_trigger_function ();

create trigger roles_audit_update_trigger
after
update on cms.roles for each row
execute function cms.audit_trigger_function ();

create trigger roles_audit_delete_trigger
after delete on cms.roles for each row
execute function cms.audit_trigger_function ();

-- Auditoría de cms.permissions.
create trigger permissions_audit_insert_trigger
after insert on cms.permissions for each row
execute function cms.audit_trigger_function ();

create trigger permissions_audit_update_trigger
after
update on cms.permissions for each row
execute function cms.audit_trigger_function ();

create trigger permissions_audit_delete_trigger
after delete on cms.permissions for each row
execute function cms.audit_trigger_function ();

-- Revisión de bugs 10x01: impide cambiar la capacidad de un permiso por otra
-- que el usuario no tiene (escalada en el sitio que se saltaría
-- can_grant_permission). Es BEFORE UPDATE para poder comparar OLD con NEW e
-- ignorar las ediciones que solo tocan el nombre o la descripción. Ver
-- enforce_permission_reshape_grantable.
create trigger permissions_enforce_reshape_grantable_trigger before
update on cms.permissions for each row
execute function cms.enforce_permission_reshape_grantable ();

-- Auditoría de cms.permission_groups.
create trigger permission_groups_audit_insert_trigger
after insert on cms.permission_groups for each row
execute function cms.audit_trigger_function ();

create trigger permission_groups_audit_update_trigger
after
update on cms.permission_groups for each row
execute function cms.audit_trigger_function ();

create trigger permission_groups_audit_delete_trigger
after delete on cms.permission_groups for each row
execute function cms.audit_trigger_function ();

-- Auditoría de la tabla intermedia cms.account_roles.
create trigger account_roles_audit_insert_trigger
after insert on cms.account_roles for each row
execute function cms.audit_trigger_function ();

-- Revisión de bugs 15x01: account_roles tiene un unique(account_id) de una
-- sola columna, así que `PUT /v1/members/role` (insert ... on conflict
-- (account_id) do update) asciende a un miembro ya asignado con un UPDATE en
-- el sitio, que dispara los disparadores de tipo UPDATE. Sin este disparador
-- se auditaba la asignación inicial, pero cualquier ascenso o descenso
-- posterior pasaba en silencio. (Las demás tablas intermedias del RBAC usan
-- claves primarias compuestas y no pueden cambiar una clave en el sitio, así
-- que solo tienen disparadores de INSERT y DELETE.)
create trigger account_roles_audit_update_trigger
after
update on cms.account_roles for each row
execute function cms.audit_trigger_function ();

create trigger account_roles_audit_delete_trigger
after delete on cms.account_roles for each row
execute function cms.audit_trigger_function ();

-- Auditoría de la tabla intermedia cms.role_permissions.
create trigger role_permissions_audit_insert_trigger
after insert on cms.role_permissions for each row
execute function cms.audit_trigger_function ();

create trigger role_permissions_audit_delete_trigger
after delete on cms.role_permissions for each row
execute function cms.audit_trigger_function ();

-- Auditoría de cms.account_permissions.
create trigger account_permissions_audit_insert_trigger
after insert on cms.account_permissions for each row
execute function cms.audit_trigger_function ();

create trigger account_permissions_audit_update_trigger
after
update on cms.account_permissions for each row
execute function cms.audit_trigger_function ();

create trigger account_permissions_audit_delete_trigger
after delete on cms.account_permissions for each row
execute function cms.audit_trigger_function ();

-- Auditoría de la tabla intermedia cms.permission_group_permissions.
create trigger permission_group_permissions_audit_insert_trigger
after insert on cms.permission_group_permissions for each row
execute function cms.audit_trigger_function ();

create trigger permission_group_permissions_audit_delete_trigger
after delete on cms.permission_group_permissions for each row
execute function cms.audit_trigger_function ();

-- Auditoría de la tabla intermedia cms.role_permission_groups.
create trigger role_permission_groups_audit_insert_trigger
after insert on cms.role_permission_groups for each row
execute function cms.audit_trigger_function ();

create trigger role_permission_groups_audit_delete_trigger
after delete on cms.role_permission_groups for each row
execute function cms.audit_trigger_function ();

-- Auditoría de cms.configuration.
-- Revisión de bugs 15x02: la configuración es una superficie de control de
-- seguridad (por ejemplo, la opción global requires_mfa de la ruta
-- PUT /v1/configuration/mfa) que se escribe directamente con Drizzle y no
-- tenía disparador de auditoría, así que desactivar la MFA de toda la
-- organización no dejaba rastro en audit_logs.
create trigger configuration_audit_insert_trigger
after insert on cms.configuration for each row
execute function cms.audit_trigger_function ();

create trigger configuration_audit_update_trigger
after
update on cms.configuration for each row
execute function cms.audit_trigger_function ();

create trigger configuration_audit_delete_trigger
after delete on cms.configuration for each row
execute function cms.audit_trigger_function ();

-- Auditoría de cms.table_metadata.
-- Revisión de bugs 15x02: los metadatos deciden qué columnas se ven y se
-- pueden editar y qué relaciones se muestran (rutas PUT /v1/tables*,
-- .../columns, .../layout). Se escribían con Drizzle sin auditoría, así que
-- manipularlos para exponer más datos no dejaba rastro.
create trigger table_metadata_audit_insert_trigger
after insert on cms.table_metadata for each row
execute function cms.audit_trigger_function ();

create trigger table_metadata_audit_update_trigger
after
update on cms.table_metadata for each row
execute function cms.audit_trigger_function ();

create trigger table_metadata_audit_delete_trigger
after delete on cms.table_metadata for each row
execute function cms.audit_trigger_function ();

-- Auditoría de cms.accounts.
-- Revisión de bugs 15x02: las cuentas del CMS (ruta PUT /v1/members/:id
-- updateAccount, además de activar y desactivar) se escribían con Drizzle sin
-- auditoría, así que los cambios de perfil y metadatos no dejaban rastro.
-- audit_logs.account_id admite NULL (on delete set null), así que auditar la
-- creación inicial de cuentas sin autor es seguro.
create trigger accounts_audit_insert_trigger
after insert on cms.accounts for each row
execute function cms.audit_trigger_function ();

create trigger accounts_audit_update_trigger
after
update on cms.accounts for each row
execute function cms.audit_trigger_function ();

create trigger accounts_audit_delete_trigger
after delete on cms.accounts for each row
execute function cms.audit_trigger_function ();