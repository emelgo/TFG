
/*
 * -------------------------------------------------------
 * Sección: Asignación de roles a cuentas del CMS
 * -------------------------------------------------------
 */
create table if not exists cms.account_roles (
  account_id UUID not null references cms.accounts (id) on delete CASCADE,
  role_id UUID not null references cms.roles (id) on delete CASCADE,
  assigned_at TIMESTAMPTZ not null default NOW(),
  assigned_by UUID references cms.accounts (id),
  valid_from TIMESTAMPTZ default NOW(),
  valid_until TIMESTAMPTZ,
  metadata JSONB default '{}'::jsonb,
  -- Clave primaria compuesta (cuenta, rol).
  primary key (account_id, role_id),
  -- account_id es único: cada cuenta tiene como máximo un rol.
  unique (account_id),
  -- valid_from debe ser anterior a valid_until.
  constraint valid_time_range check (
    valid_from is null
    or valid_until is null
    or valid_from < valid_until
  )
);

comment on table cms.account_roles is 'Table to store the account roles';

comment on column cms.account_roles.account_id is 'The ID of the account';

comment on column cms.account_roles.role_id is 'The ID of the role';

comment on column cms.account_roles.assigned_at is 'The time the role was assigned';

comment on column cms.account_roles.assigned_by is 'The user who assigned the role';

comment on column cms.account_roles.valid_from is 'The time the role is valid from';

comment on column cms.account_roles.valid_until is 'The time the role is valid until';

comment on column cms.account_roles.metadata is 'The metadata of the role';

-- Permisos de tabla; la RLS decide qué puede hacer cada usuario.
grant
select
,
  insert,
update,
delete on table cms.account_roles to authenticated,
service_role;

-- RLS activada.
alter table cms.account_roles ENABLE row LEVEL SECURITY;

-- Función `cms.validate_account_role_business_rules`: disparador que valida
-- las reglas de negocio de una asignación (cuenta y rol activos, un único rol
-- por cuenta).
create or replace function cms.validate_account_role_business_rules () RETURNS TRIGGER
set
  search_path = '' as $$
DECLARE
    v_account_active BOOLEAN;
    v_role_active    BOOLEAN;
    v_existing_count INTEGER;
BEGIN
    -- Check account is active (complex query, can't be in CHECK constraint)
    SELECT is_active
    INTO v_account_active
    FROM cms.accounts
    WHERE id = NEW.account_id;

    -- Check if account is active otherwise raise an exception
    IF NOT v_account_active THEN
        RAISE EXCEPTION 'Cannot assign role to inactive account'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Check role is currently valid (involves NOW())
    SELECT (valid_until IS NULL OR valid_until > NOW())
    INTO v_role_active
    FROM cms.roles
    WHERE id = NEW.role_id;

    -- Check if role is currently valid otherwise raise an exception
    IF NOT v_role_active THEN
        RAISE EXCEPTION 'Cannot assign expired role'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Check for duplicate active assignments (complex query)
    IF TG_OP = 'INSERT' THEN
        SELECT COUNT(*)
        INTO v_existing_count
        FROM cms.account_roles
        WHERE account_id = NEW.account_id
          AND role_id = NEW.role_id
          AND (valid_until IS NULL OR valid_until > NOW());

        IF v_existing_count > 0 THEN
            RAISE EXCEPTION 'Account already has this role assigned'
                USING ERRCODE = 'unique_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

create trigger account_role_business_rules_check BEFORE INSERT
or
update on cms.account_roles for EACH row
execute FUNCTION cms.validate_account_role_business_rules ();
