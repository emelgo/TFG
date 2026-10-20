/*
 * -------------------------------------------------------
 * Sección: Roles de equipo
 * Catálogo de roles que puede tener un miembro dentro de una cuenta de
 * equipo (por ejemplo `owner` y `member`). Cada rol tiene un nivel de
 * jerarquía único: cuanto menor es el número, más poder tiene, y un miembro
 * solo puede gestionar a otros de nivel inferior al suyo. Los permisos de
 * cada rol se definen en `role_permissions` (06-roles-permissions.sql).
 * -------------------------------------------------------
 */

-- Tabla de roles.
create table if not exists
  public.roles (
    name varchar(50) not null,
    hierarchy_level int not null check (hierarchy_level > 0),
    primary key (name),
    unique (hierarchy_level)
  );

-- Se retiran todos los permisos para concederlos después de forma explícita.
revoke all on public.roles
from
  anon,
  authenticated,
  service_role;

-- Solo lectura: los roles se crean por migración o semilla, nunca desde la API.
grant
select
on table public.roles to authenticated,
service_role;

-- La política de lectura se define en 05-memberships.sql.
alter table public.roles enable row level security;