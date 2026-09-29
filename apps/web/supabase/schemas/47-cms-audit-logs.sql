
-- SECTION: AUDIT LOG TABLE
-- In this section, we define the audit log table. This table is used to store the audit logs.
create table if not exists cms.audit_logs (
  id UUID primary key default gen_random_uuid (),
  created_at TIMESTAMPTZ not null default now(),
  account_id UUID references cms.accounts (id) on delete set null,
  user_id UUID references auth.users (id) on delete set null default auth.uid (),
  operation TEXT not null,
  schema_name TEXT not null,
  table_name TEXT not null,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB,
  severity cms.audit_log_severity not null,
  metadata JSONB
);

comment on table cms.audit_logs is 'Table to store the audit logs';

comment on column cms.audit_logs.id is 'The ID of the audit log';

comment on column cms.audit_logs.created_at is 'The timestamp of the audit log';

comment on column cms.audit_logs.account_id is 'The ID of the account';

comment on column cms.audit_logs.user_id is 'The ID of the user';

comment on column cms.audit_logs.operation is 'The operation of the audit log';

comment on column cms.audit_logs.schema_name is 'The schema of the audit log';

comment on column cms.audit_logs.table_name is 'The table of the audit log';

comment on column cms.audit_logs.record_id is 'The ID of the record';

comment on column cms.audit_logs.old_data is 'The old data of the audit log';

comment on column cms.audit_logs.new_data is 'The new data of the audit log';

comment on column cms.audit_logs.severity is 'The severity of the audit log';

comment on column cms.audit_logs.metadata is 'The metadata of the audit log';

-- Grants
grant
select
,
  INSERT on cms.audit_logs to authenticated;

grant
select
  on cms.audit_logs to service_role;

-- Enable RLS for the audit log table
alter table cms.audit_logs ENABLE row LEVEL SECURITY;

-- Indexes
create index idx_audit_logs_created_at on cms.audit_logs (created_at);

create index idx_audit_logs_account_id on cms.audit_logs (account_id);

create index idx_audit_logs_operation on cms.audit_logs (operation);

create index idx_audit_logs_schema_table on cms.audit_logs (schema_name, table_name);


-- SECTION: CREATE AUDIT LOG
-- In this section, we define the create audit log function. This function is used to create an audit log.
create or replace function cms.create_audit_log (
  p_operation TEXT,
  p_schema TEXT,
  p_table TEXT,
  p_record_id TEXT,
  p_old_data JSONB,
  p_new_data JSONB,
  p_severity cms.audit_log_severity default 'info',
  p_metadata JSONB default '{}'::jsonb
) RETURNS UUID
set
  search_path = '' as $$
DECLARE
    v_log_id UUID;
BEGIN
    -- Insert log entry
    INSERT INTO cms.audit_logs (account_id,
                                     operation,
                                     schema_name,
                                     table_name,
                                     record_id,
                                     old_data,
                                     new_data,
                                     severity,
                                     metadata)
    VALUES (cms.get_current_user_account_id(),
            p_operation,
            p_schema,
            p_table,
            p_record_id,
            p_old_data,
            p_new_data,
            p_severity,
            p_metadata)
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- SECTION: CAN READ AUDIT LOG
-- In this section, we define the can read audit log function. This function is used to check if the user can read the audit log.
-- Alineada con la versión que dejan las migraciones (el esquema declarativo
-- heredado estaba desfasado respecto a ellas). Ver ADR-015.
CREATE OR REPLACE FUNCTION cms.can_read_audit_log(p_target_account_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
    v_current_account_id        uuid;
    v_current_account_role_rank int;
    v_target_account_role_rank  int;
begin
    if not cms.verify_admin_access() then
        return false;
    end if;

    if not cms.has_admin_permission('log'::cms.system_resource, 'select'::cms.system_action) then
        return false;
    end if;

    v_current_account_id := cms.get_current_user_account_id();

    -- The user is the owner of the audit log
    if p_target_account_id is not null and p_target_account_id = v_current_account_id then
        return true;
    end if;

    select rank
    into v_current_account_role_rank
    from cms.roles
             join cms.account_roles on cms.roles.id = cms.account_roles.role_id
    where cms.account_roles.account_id = v_current_account_id;

    -- Cannot establish the reader's standing: deny.
    if v_current_account_role_rank is null then
        return false;
    end if;

    if p_target_account_id is not null then
        select rank
        into v_target_account_role_rank
        from cms.roles
                 join cms.account_roles on cms.roles.id = cms.account_roles.role_id
        where cms.account_roles.account_id = p_target_account_id;
    end if;

    -- Unknown subject (role-less account, or a row orphaned by ON DELETE SET NULL).
    -- We cannot prove the reader outranks it, so restrict it to the top of the hierarchy
    -- rather than falling through to allow.
    if v_target_account_role_rank is null then
        return v_current_account_role_rank >= (select max(rank) from cms.roles);
    end if;

    return v_current_account_role_rank >= v_target_account_role_rank;
end;
$function$;

grant
execute on function cms.can_read_audit_log to authenticated;


-- SELECT(cms.audit_logs)
create policy select_cms_audit_logs on cms.audit_logs for
select
  using (cms.can_read_audit_log (account_id));

-- INSERT(cms.audit_logs)
-- Only the owner of the audit log can insert into the audit log table
create policy insert_cms_audit_logs on cms.audit_logs for INSERT
with
  check (
    -- The user is the owner of the audit log
    account_id = cms.get_current_user_account_id ()
  );

-- [TFG] RNF-02: la API del CMS registra operaciones sobre `auth.users` con esta
-- función usando la conexión del usuario. Es SECURITY INVOKER, así que el
-- `insert` en `cms.audit_logs` sigue sujeto a sus políticas RLS; el `grant`
-- solo sustituye al EXECUTE de PUBLIC que PymeKit revoca por defecto.
grant execute on function cms.create_audit_log (text, text, text, text, jsonb, jsonb, cms.audit_log_severity, jsonb) to authenticated;
