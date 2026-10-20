
/*
 * -------------------------------------------------------
 * Sección: Roles del CMS
 * Roles del panel de administración (independientes de los roles de equipo
 * de `public.roles`). Cada rol tiene un `rank` único: cuanto mayor es, más
 * poder tiene, y nadie puede gestionar roles de rango igual o superior al
 * suyo. Pueden tener un periodo de validez opcional.
 * -------------------------------------------------------
 */
create table if not exists cms.roles (
  id UUID primary key default gen_random_uuid (),
  name VARCHAR(50) not null unique,
  description VARCHAR(500),
  created_at TIMESTAMPTZ not null default NOW(),
  updated_at TIMESTAMPTZ not null default NOW(),
  metadata JSONB default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  rank INTEGER default 0 not null check (rank >= 0) check (rank <= 100),
  valid_from TIMESTAMPTZ default NOW(),
  valid_until TIMESTAMPTZ,
  -- valid_from debe ser anterior a valid_until.
  constraint valid_time_range check (
    valid_from is null
    or valid_until is null
    or valid_from < valid_until
  ),
  -- El rango es único para que la jerarquía no tenga empates.
  constraint roles_rank_unique unique (rank)
);

comment on table cms.roles is 'Table to store the roles';

comment on column cms.roles.id is 'The ID of the role';

comment on column cms.roles.name is 'The name of the role';

comment on column cms.roles.description is 'The description of the role';

comment on column cms.roles.created_at is 'The creation time of the role';

comment on column cms.roles.updated_at is 'The last update time of the role';

comment on column cms.roles.metadata is 'The metadata of the role';

comment on column cms.roles.rank is 'The rank of the role';

comment on column cms.roles.valid_from is 'The time the role is valid from';

comment on column cms.roles.valid_until is 'The time the role is valid until';

-- Permisos de tabla; la RLS decide qué puede hacer cada usuario.
grant
select
,
  insert,
update,
delete on table cms.roles to authenticated,
service_role;

-- RLS activada; las políticas están en 40-cms-permissions-rls.sql.
alter table cms.roles ENABLE row LEVEL SECURITY;
