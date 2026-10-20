/*
 * -------------------------------------------------------
 * Sección: Cuenta activa
 * Guarda en qué cuenta (personal o de equipo) está trabajando cada usuario,
 * de modo que la interfaz y las funciones RPC puedan resolver "la cuenta
 * actual" en el servidor sin depender de la URL. El puntero es opcional: si
 * no hay fila, o si el usuario ya no es miembro del equipo guardado, se usa
 * la cuenta personal.
 * -------------------------------------------------------
 */

-- Tabla: una fila por usuario que apunta a su cuenta activa.
create table if not exists
  public.user_active_account (
    user_id uuid primary key references auth.users (id) on delete cascade,
    account_id uuid not null references public.accounts (id) on delete cascade,
    updated_at timestamp with time zone default now() not null
  );

comment on table public.user_active_account is 'The account (personal or team) the user is currently working in. Absence of a row resolves to the personal account.';

-- RLS activada; se retiran todos los permisos para concederlos después.
alter table "public"."user_active_account" enable row level security;

revoke all on public.user_active_account
from
  anon,
  authenticated,
  service_role;

grant
select
,
  insert,
update,
delete on table public.user_active_account to service_role;

grant
select
,
  insert,
  delete on table public.user_active_account to authenticated;

-- authenticated solo puede actualizar el propio puntero. La columna de
-- identidad (user_id) es el vínculo con el tenant y nunca debe cambiar;
-- updated_at la escribe set_active_account, que se ejecuta con los permisos
-- de quien la llama y por eso necesita el permiso sobre esa columna. Postgres
-- lo aplica antes que la RLS (defensa en profundidad además de la política
-- user_active_account_write).
grant
update (account_id, updated_at) on table public.user_active_account to authenticated;

create index if not exists ix_user_active_account_account_id on public.user_active_account (account_id);

-- Política SELECT: cada usuario solo ve su propia fila.
create policy "user_active_account_read" on public.user_active_account for
select
  to authenticated using (user_id = (select auth.uid ()));

-- Política de escritura (todas las operaciones): un usuario solo puede tocar
-- su propia fila y solo puede apuntar a su cuenta personal o a un equipo del
-- que sea miembro, para que nadie pueda "activar" una cuenta ajena.
create policy "user_active_account_write" on public.user_active_account for all to authenticated using (user_id = (select auth.uid ()))
with
  check (
    user_id = (select auth.uid ())
    and (
      account_id = (select auth.uid ())
      or public.has_role_on_account (account_id)
    )
  );

-- Restricción de MFA sobre el puntero de cuenta activa, en la línea de las
-- políticas restrictivas del resto de tablas de usuario (13-mfa.sql).
create policy restrict_mfa_user_active_account
    on public.user_active_account
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

--
-- Función `public.set_active_account`: valida la membresía y guarda la cuenta
-- activa del usuario. Pasar el propio id de usuario selecciona la cuenta
-- personal. No es `security definer`: se ejecuta con los permisos del usuario
-- y la política user_active_account_write vuelve a comprobarlo.
create
or replace function public.set_active_account (target_account_id uuid) returns void
set
  search_path = '' as $$
begin
  if target_account_id <> (select auth.uid())
     and not public.has_role_on_account(target_account_id) then
    raise exception 'You are not a member of the target account';
  end if;

  insert into public.user_active_account (user_id, account_id)
  values ((select auth.uid()), target_account_id)
  on conflict (user_id)
  do update set account_id = excluded.account_id, updated_at = now();
end;
$$ language plpgsql;

grant
execute on function public.set_active_account (uuid) to authenticated;

--
-- Función `public.active_account_id`: única fuente de verdad sobre "qué
-- cuenta está activa". Lee el puntero guardado y vuelve a la cuenta personal
-- (id = id del usuario) si no hay ninguno o si la membresía guardada ya no es
-- válida. La reutilizan todas las RPC de cuenta activa.
create
or replace function public.active_account_id () returns uuid
set
  search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_active_id uuid;
begin
  select ua.account_id into v_active_id
  from public.user_active_account ua
  where ua.user_id = v_user_id;

  if v_active_id is null then
    return v_user_id;
  end if;

  if v_active_id <> v_user_id
     and not public.has_role_on_account(v_active_id) then
    return v_user_id;
  end if;

  return v_active_id;
end;
$$ language plpgsql;

grant
execute on function public.active_account_id () to authenticated,
service_role;

--
-- Función `public.active_account_workspace`: carga en una sola consulta todos
-- los datos que necesita la interfaz sobre la cuenta activa (nombre, rol,
-- permisos, estado de la suscripción), con una forma común para cuentas
-- personales y de equipo. Igual que la anterior, vuelve a la cuenta personal
-- si no hay puntero o si la membresía ya no es válida.
create
or replace function public.active_account_workspace () returns table (
  id uuid,
  name varchar(255),
  picture_url varchar(1000),
  slug text,
  is_personal_account boolean,
  role varchar(50),
  role_hierarchy_level int,
  primary_owner_user_id uuid,
  public_data jsonb,
  subscription_status public.subscription_status,
  permissions public.app_permissions[]
)
set
  search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_active_id uuid := public.active_account_id();
begin
  return query
  select
    accounts.id,
    accounts.name,
    accounts.picture_url,
    accounts.slug,
    accounts.is_personal_account,
    accounts_memberships.account_role,
    roles.hierarchy_level,
    accounts.primary_owner_user_id,
    accounts.public_data,
    (
      select subscriptions.status
      from public.subscriptions
      where subscriptions.account_id = accounts.id
      order by subscriptions.created_at desc
      limit 1
    ) as subscription_status,
    coalesce(
      array_agg(distinct role_permissions.permission)
        filter (where role_permissions.permission is not null),
      array[]::public.app_permissions[]
    )
  from public.accounts
    left join public.accounts_memberships
      on accounts.id = accounts_memberships.account_id
      and accounts_memberships.user_id = v_user_id
    left join public.roles on accounts_memberships.account_role = roles.name
    left join public.role_permissions
      on accounts_memberships.account_role = role_permissions.role
  where accounts.id = v_active_id
  group by
    accounts.id,
    accounts_memberships.account_role,
    roles.hierarchy_level;
end;
$$ language plpgsql;

grant
execute on function public.active_account_workspace () to authenticated,
service_role;

--
-- Función `public.get_active_account_members`: miembros de la cuenta activa,
-- resuelta en el servidor. Delega en `get_account_members` (por slug); una
-- cuenta personal activa tiene slug nulo y, por tanto, no devuelve filas (las
-- cuentas personales no tienen miembros).
create
or replace function public.get_active_account_members () returns table (
  id uuid,
  user_id uuid,
  account_id uuid,
  role varchar(50),
  role_hierarchy_level int,
  primary_owner_user_id uuid,
  name varchar,
  email varchar,
  picture_url varchar,
  created_at timestamptz,
  updated_at timestamptz
)
set
  search_path = '' as $$
begin
  return query
  select * from public.get_account_members(
    -- `(select …)`: la función es volátil y, sin la subconsulta, Postgres
    -- la evaluaría una vez por cada fila de `accounts` (BITACORA B-55)
    (select accounts.slug from public.accounts
     where accounts.id = (select public.active_account_id()))
  );
end;
$$ language plpgsql;

grant
execute on function public.get_active_account_members () to authenticated,
service_role;

--
-- Función `public.get_active_account_invitations`: invitaciones de la cuenta
-- activa, resuelta en el servidor. Delega en `get_account_invitations`; una
-- cuenta personal activa no devuelve ninguna.
create
or replace function public.get_active_account_invitations () returns table (
  id integer,
  email varchar(255),
  account_id uuid,
  invited_by uuid,
  role varchar(50),
  created_at timestamptz,
  updated_at timestamptz,
  sent_at timestamptz,
  last_send_attempt_at timestamptz,
  resend_count integer,
  expires_at timestamptz,
  inviter_name varchar,
  inviter_email varchar
)
set
  search_path = '' as $$
begin
  return query
  select * from public.get_account_invitations(
    -- `(select …)`: la función es volátil y, sin la subconsulta, Postgres
    -- la evaluaría una vez por cada fila de `accounts` (BITACORA B-55)
    (select accounts.slug from public.accounts
     where accounts.id = (select public.active_account_id()))
  );
end;
$$ language plpgsql;

grant
execute on function public.get_active_account_invitations () to authenticated,
service_role;
