
/*
 * -------------------------------------------------------
 * Sección: Permisos por cuenta del CMS
 * Excepciones individuales al rol: permiten conceder (`is_grant = true`) o
 * denegar explícitamente (`false`) un permiso a una cuenta concreta. Una
 * denegación explícita prevalece sobre lo que conceda su rol.
 * -------------------------------------------------------
 */
create table cms.account_permissions (
  account_id UUID not null references cms.accounts (id) on delete CASCADE,
  permission_id UUID not null references cms.permissions (id) on delete CASCADE,
  is_grant BOOLEAN not null, -- TRUE = explicitly grant, FALSE = explicitly deny
  granted_at TIMESTAMPTZ not null default NOW(),
  granted_by UUID references cms.accounts (id),
  valid_from TIMESTAMPTZ default NOW(),
  valid_until TIMESTAMPTZ,
  metadata JSONB default '{}'::jsonb,
  primary key (account_id, permission_id),
  -- valid_from debe ser anterior a valid_until.
  constraint valid_time_range check (
    valid_from is null
    or valid_until is null
    or valid_from < valid_until
  )
);

comment on table cms.account_permissions is 'Table to store the account permissions';

comment on column cms.account_permissions.account_id is 'The ID of the account';

comment on column cms.account_permissions.permission_id is 'The ID of the permission';

comment on column cms.account_permissions.is_grant is 'Whether the permission is granted';

comment on column cms.account_permissions.granted_at is 'The time the permission was granted';

comment on column cms.account_permissions.granted_by is 'The user who granted the permission';

comment on column cms.account_permissions.valid_from is 'The time the permission is valid from';

comment on column cms.account_permissions.valid_until is 'The time the permission is valid until';

comment on column cms.account_permissions.metadata is 'The metadata of the permission';

-- Permisos de tabla; la RLS decide qué puede hacer cada usuario.
grant
select
,
  insert,
update,
delete on table cms.account_permissions to authenticated,
service_role;

-- RLS activada; las políticas están en 40-cms-permissions-rls.sql.
alter table cms.account_permissions ENABLE row LEVEL SECURITY;