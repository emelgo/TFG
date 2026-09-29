
-- SECTION: UPDATE UPDATED AT COLUMN
-- In this section, we define the update updated at column function. This function is used to update the updated at column for all relevant tables.
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

-- SECTION: AUDIT TRIGGERS FOR PERMISSIONS, ROLES, AND PERMISSION GROUPS
-- This section adds database triggers to automatically log changes to permission-related tables
-- SECTION: AUDIT TRIGGER FUNCTION
-- Generic trigger function that can be used for any table to create audit logs
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
            p_severity := 'info',
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

-- SECTION: ROLES TABLE AUDIT TRIGGERS
-- Create triggers for the roles table
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

-- SECTION: PERMISSIONS TABLE AUDIT TRIGGERS
-- Create triggers for the permissions table
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

-- bug-hunt 10x01: block reshaping a permission's capability into one the caller does
-- not hold (in-place escalation past can_grant_permission). BEFORE UPDATE so it can
-- compare OLD vs NEW and ignore metadata-only edits. See enforce_permission_reshape_grantable.
create trigger permissions_enforce_reshape_grantable_trigger before
update on cms.permissions for each row
execute function cms.enforce_permission_reshape_grantable ();

-- SECTION: PERMISSION GROUPS TABLE AUDIT TRIGGERS
-- Create triggers for the permission_groups table
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

-- SECTION: ACCOUNT ROLES TABLE AUDIT TRIGGERS
-- Create triggers for the account_roles junction table
create trigger account_roles_audit_insert_trigger
after insert on cms.account_roles for each row
execute function cms.audit_trigger_function ();

-- bug-hunt 15x01: account_roles has a single-column unique(account_id), so
-- `PUT /v1/members/role` (insert ... on conflict (account_id) do update) promotes
-- an already-assigned member as an in-place UPDATE, which fires UPDATE-class
-- triggers. Without this trigger the initial grant was audited but every later
-- promote/demote was silent. (Other RBAC junctions use composite PKs and cannot
-- change a key in place, so they remain insert/delete only.)
create trigger account_roles_audit_update_trigger
after
update on cms.account_roles for each row
execute function cms.audit_trigger_function ();

create trigger account_roles_audit_delete_trigger
after delete on cms.account_roles for each row
execute function cms.audit_trigger_function ();

-- SECTION: ROLE PERMISSIONS TABLE AUDIT TRIGGERS
-- Create triggers for the role_permissions junction table
create trigger role_permissions_audit_insert_trigger
after insert on cms.role_permissions for each row
execute function cms.audit_trigger_function ();

create trigger role_permissions_audit_delete_trigger
after delete on cms.role_permissions for each row
execute function cms.audit_trigger_function ();

-- SECTION: ACCOUNT PERMISSIONS TABLE AUDIT TRIGGERS
-- Create triggers for the account_permissions table
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

-- SECTION: PERMISSION GROUP PERMISSIONS TABLE AUDIT TRIGGERS
-- Create triggers for the permission_group_permissions junction table
create trigger permission_group_permissions_audit_insert_trigger
after insert on cms.permission_group_permissions for each row
execute function cms.audit_trigger_function ();

create trigger permission_group_permissions_audit_delete_trigger
after delete on cms.permission_group_permissions for each row
execute function cms.audit_trigger_function ();

-- SECTION: ROLE PERMISSION GROUPS TABLE AUDIT TRIGGERS
-- Create triggers for the role_permission_groups junction table
create trigger role_permission_groups_audit_insert_trigger
after insert on cms.role_permission_groups for each row
execute function cms.audit_trigger_function ();

create trigger role_permission_groups_audit_delete_trigger
after delete on cms.role_permission_groups for each row
execute function cms.audit_trigger_function ();

-- SECTION: CONFIGURATION TABLE AUDIT TRIGGERS
-- bug-hunt 15x02: cms.configuration is a security control surface (e.g. the
-- org-wide requires_mfa flag, route PUT /v1/configuration/mfa) written directly via
-- Drizzle, but had no audit trigger -- so disabling org MFA left no audit_logs trail.
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

-- SECTION: TABLE METADATA TABLE AUDIT TRIGGERS
-- bug-hunt 15x02: table_metadata drives column visibility / editability / relations
-- (routes PUT /v1/tables*, .../columns, .../layout) and was written directly via
-- Drizzle with no audit trigger, so metadata poisoning that widens data exposure
-- left no trail.
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

-- SECTION: ACCOUNTS TABLE AUDIT TRIGGERS
-- bug-hunt 15x02: cms.accounts (route PUT /v1/members/:id updateAccount, plus
-- activate/deactivate) was written directly via Drizzle with no audit trigger, so
-- account profile/metadata changes left no audit_logs trail. audit_logs.account_id is
-- nullable (on delete set null), so auditing account bootstrap with a null actor is safe.
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