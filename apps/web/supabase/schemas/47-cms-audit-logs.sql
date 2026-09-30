
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
-- [TFG] RNF-02 · Integridad del registro de auditoría (PymeKit, F2.6): el
-- personal del CMS solo puede LEER las entradas (filtradas por la política
-- `select_cms_audit_logs`). No se concede INSERT, UPDATE ni DELETE a
-- `authenticated`: las entradas las escriben únicamente las funciones del
-- sistema (`security definer`: CRUD del explorador, *triggers* de auditoría,
-- `grant/revoke_admin_access` y `log_auth_user_action`), de modo que nadie
-- puede fabricar, alterar ni borrar su propio rastro. El código heredado
-- concedía INSERT con una política que solo exigía `account_id` propio: el
-- personal podía escribir entradas con cualquier operación, tabla, datos e
-- incluso `user_id` ajeno (ADR-015, pendiente cerrado en F2.6).
grant
select
  on cms.audit_logs to authenticated;

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
-- Escribe una entrada de auditoría a nombre de la cuenta del CMS de la sesión.
-- Es SECURITY INVOKER y NO está concedida a `authenticated` (ver el `revoke`
-- al final del fichero): solo la llaman funciones `security definer` del
-- propio CMS, que se ejecutan como propietario de la tabla y ya han
-- comprobado permisos. Los *claims* de la petición siguen disponibles dentro
-- de ellas, así que la entrada queda atribuida al usuario real.
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


-- SECTION: CAN READ AUDIT LOG DATA
-- ¿Puede la sesión ver los datos de fila (`old_data`/`new_data`) de una
-- entrada de auditoría sobre `esquema.tabla`?
--
-- `can_read_audit_log` decide qué ENTRADAS se ven (por el rango de quien
-- actuó), pero una entrada guarda la fila completa antes y después del
-- cambio, y esa fila puede ser de una tabla que el lector no puede leer (la
-- cambió alguien de rango inferior con otros permisos). La API del CMS usa
-- esta función para devolver esos datos a `null` (redactados) cuando:
--
--  - esquema `cms`: basta `log:select` (es el rastro del propio CMS, lo que
--    ese permiso autoriza a revisar);
--  - `auth.users`: exige `auth_user:select` (explorador de usuarios);
--  - cualquier otro esquema protegido (`auth`, `vault`, `pg_*`…): nunca;
--  - el resto: permiso `select` sobre la tabla (`has_data_permission`).
--
-- SECURITY INVOKER: solo combina funciones de permisos ya concedidas.
-- [TFG] RNF-02 · PymeKit, F2.6.
create or replace function cms.can_read_audit_log_data (
  p_schema_name text,
  p_table_name text
) returns boolean
language plpgsql
stable
set
  search_path = '' as $$
begin
    if p_schema_name is null or p_table_name is null then
        return false;
    end if;

    if p_schema_name = 'cms' then
        return cms.has_admin_permission('log'::cms.system_resource, 'select'::cms.system_action);
    end if;

    if p_schema_name = 'auth' then
        return p_table_name = 'users'
            and cms.has_admin_permission('auth_user'::cms.system_resource, 'select'::cms.system_action);
    end if;

    return cms.validate_schema_access(p_schema_name)
        and cms.has_data_permission('select'::cms.system_action, p_schema_name, p_table_name);
end;
$$;

comment on function cms.can_read_audit_log_data (text, text) is
  'Indica si la sesión puede ver los datos de fila de una entrada de auditoría sobre esa tabla (si no, la API los redacta)';

grant execute on function cms.can_read_audit_log_data (text, text) to authenticated;

-- SELECT(cms.audit_logs)
create policy select_cms_audit_logs on cms.audit_logs for
select
  using (cms.can_read_audit_log (account_id));

-- Sin política de INSERT (ni UPDATE/DELETE): `authenticated` no tiene esos
-- privilegios sobre la tabla y las funciones del sistema escriben como su
-- propietario. Ver la justificación en la sección de *grants*.

-- [TFG] RNF-02: `create_audit_log` escribe cualquier operación, tabla y datos
-- que se le pasen, así que no puede quedar al alcance del personal. Se retira
-- el EXECUTE que concedía el código heredado; las funciones que la llaman son
-- `security definer` y la ejecutan como propietario.
revoke all on function cms.create_audit_log (text, text, text, text, jsonb, jsonb, cms.audit_log_severity, jsonb) from public, anon, authenticated;

-- SECTION: LOG AUTH USER ACTION
-- Entrada de auditoría de las acciones del explorador de usuarios (F2.5).
--
-- Esas acciones usan la API de administración de Auth con la clave de
-- servicio, así que Auth las atribuye a `service_role`. La API del CMS deja
-- después esta entrada con la sesión del operador. Antes lo hacía llamando a
-- `create_audit_log` con un INSERT permitido por RLS, lo que dejaba al
-- personal escribir entradas arbitrarias; esta función estrecha la puerta:
--
--  - exige acceso vigente al CMS y el permiso `auth_user` de la acción
--    correspondiente (crear/invitar → insert, bloquear, desbloquear,
--    restablecer, enlace de acceso y quitar MFA → update, borrar → delete);
--  - solo acepta las operaciones conocidas y fija esquema (`auth`), tabla
--    (`users`), gravedad y metadatos;
--  - la atribución (`account_id`, `user_id`) sale de la sesión, nunca de los
--    parámetros.
--
-- Es `security definer` porque `authenticated` ya no puede insertar en la
-- tabla. Queda como riesgo residual (documentado en ADR-015) que un operador
-- con ese permiso registre una acción que no hizo, siempre a su propio
-- nombre; el esquema `cms` no está expuesto por PostgREST, así que solo la
-- API del CMS la invoca.
create or replace function cms.log_auth_user_action (
  p_operation text,
  p_target text,
  p_details jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set
  search_path = '' as $$
declare
    v_action cms.system_action;
    v_log_id uuid;
begin
    if not cms.verify_admin_access() then
        raise exception 'Invalid admin access'
            using errcode = 'insufficient_privilege';
    end if;

    v_action := case p_operation
        when 'create_auth_user' then 'insert'::cms.system_action
        when 'invite_auth_user' then 'insert'::cms.system_action
        when 'ban_user' then 'update'::cms.system_action
        when 'unban_user' then 'update'::cms.system_action
        when 'reset_password' then 'update'::cms.system_action
        when 'send_magic_link' then 'update'::cms.system_action
        when 'remove_mfa_factor' then 'update'::cms.system_action
        when 'delete_auth_user' then 'delete'::cms.system_action
        end;

    if v_action is null then
        raise exception 'Unknown auth user operation'
            using errcode = 'invalid_parameter_value';
    end if;

    if not cms.has_admin_permission('auth_user'::cms.system_resource, v_action) then
        raise exception 'Insufficient permissions'
            using errcode = 'insufficient_privilege';
    end if;

    -- El destino es un UUID o, en una invitación fallida, un correo.
    if p_target is null or length(p_target) = 0 or length(p_target) > 320 then
        raise exception 'Invalid target'
            using errcode = 'invalid_parameter_value';
    end if;

    -- Detalles acotados: un objeto pequeño, no un volcado arbitrario.
    if p_details is not null
        and (jsonb_typeof(p_details) <> 'object' or pg_column_size(p_details) > 4096) then
        raise exception 'Invalid details'
            using errcode = 'invalid_parameter_value';
    end if;

    insert into cms.audit_logs (account_id,
                                user_id,
                                operation,
                                schema_name,
                                table_name,
                                record_id,
                                old_data,
                                new_data,
                                severity,
                                metadata)
    values (cms.get_current_user_account_id(),
            auth.uid(),
            p_operation,
            'auth',
            'users',
            p_target,
            null,
            -- La operación va al final para que los detalles no la suplanten.
            coalesce(p_details, '{}'::jsonb) || jsonb_build_object('operation', p_operation),
            'info'::cms.audit_log_severity,
            jsonb_build_object('operation_type', 'auth_user_management'))
    returning id into v_log_id;

    return v_log_id;
end;
$$;

comment on function cms.log_auth_user_action (text, text, jsonb) is
  'Registra en la auditoría una acción del explorador de usuarios, a nombre de la sesión y con el permiso auth_user correspondiente';

grant execute on function cms.log_auth_user_action (text, text, jsonb) to authenticated;
