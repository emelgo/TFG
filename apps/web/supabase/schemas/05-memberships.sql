/*
 * -------------------------------------------------------
 * Sección: Membresías de cuentas
 * Relaciona usuarios con cuentas de equipo y les asigna un rol.
 * Es la pieza central del aislamiento multi-tenant: casi todas las
 * políticas RLS de la plataforma preguntan "¿es este usuario miembro de
 * esta cuenta?" a través de esta tabla y de las funciones auxiliares que se
 * definen aquí (`has_role_on_account`, `is_team_member`...).
 * -------------------------------------------------------
 */

-- Tabla de membresías: clave primaria compuesta (usuario, cuenta), de modo que
-- un usuario solo puede tener un rol por cuenta.
create table if not exists
  public.accounts_memberships (
    user_id uuid references auth.users on delete cascade not null,
    account_id uuid references public.accounts (id) on delete cascade not null,
    account_role varchar(50) references public.roles (name) not null,
    created_at timestamptz default current_timestamp not null,
    updated_at timestamptz default current_timestamp not null,
    created_by uuid references auth.users on delete set null,
    updated_by uuid references auth.users on delete set null,
    primary key (user_id, account_id)
  );

comment on table public.accounts_memberships is 'The memberships for an account';

comment on column public.accounts_memberships.account_id is 'The account the membership is for';

comment on column public.accounts_memberships.account_role is 'The role for the membership';

-- Se retiran todos los permisos para concederlos después de forma explícita.
revoke all on public.accounts_memberships
from
  anon,
  authenticated,
  service_role;

-- Permisos de tabla para usuarios autenticados.
-- authenticated no tiene INSERT: las membresías solo las crean
-- accept_invitation (ejecutada con el cliente de service_role) y
-- create_team_account (`security definer`), así que este rol nunca inserta
-- filas directamente.
grant
select
,
  delete on table public.accounts_memberships to authenticated;

grant
select
,
  insert,
  delete on table public.accounts_memberships to service_role;

-- service_role conserva UPDATE sobre toda la tabla.
grant
update on table public.accounts_memberships to service_role;

-- authenticated solo puede actualizar el rol de la membresía. Las columnas de
-- identidad (user_id, account_id) no deben cambiar nunca: definen el vínculo
-- con el tenant, y permitirlo dejaría a un miembro "mover" una membresía a
-- otra cuenta. Postgres lo impide de entrada, además del disparador
-- kit.prevent_memberships_update.
grant
update (account_role) on table public.accounts_memberships to authenticated;

-- Índices para las búsquedas por cuenta, por usuario y por rol, que hacen
-- constantemente las políticas RLS.
create index ix_accounts_memberships_account_id on public.accounts_memberships (account_id);

create index ix_accounts_memberships_user_id on public.accounts_memberships (user_id);

create index ix_accounts_memberships_account_role on public.accounts_memberships (account_role);

-- Disparadores de marcas de tiempo y autoría (definidos en 02-config.sql).
create trigger accounts_memberships_set_timestamps
before insert or update on public.accounts_memberships
for each row execute function public.trigger_set_timestamps();

create trigger accounts_memberships_set_user_tracking
before insert or update on public.accounts_memberships
for each row execute function public.trigger_set_user_tracking();

-- RLS activada: las políticas se definen al final del fichero.
alter table public.accounts_memberships enable row level security;

-- Función `kit.prevent_account_owner_membership_delete`: impide que se elimine
-- la membresía del propietario principal, porque la cuenta se quedaría sin
-- nadie con control total sobre ella.
create
or replace function kit.prevent_account_owner_membership_delete () returns trigger
set
  search_path = '' as $$
begin
    if exists(
        select
            1
        from
            public.accounts
        where
            id = old.account_id
            and primary_owner_user_id = old.user_id) then
    raise exception 'The primary account owner cannot be removed from the account membership list';

end if;

    return old;

end;

$$ language plpgsql;

create
or replace trigger prevent_account_owner_membership_delete_check before delete on public.accounts_memberships for each row
execute function kit.prevent_account_owner_membership_delete ();

-- Función `kit.prevent_memberships_update`: impide "mover" una membresía,
-- porque las columnas de identidad son inmutables. Todo lo demás (account_role,
-- marcas de tiempo, autoría) puede cambiar, incluida la cascada
-- `on delete set null` desde auth.users, que llega como un UPDATE de
-- created_by/updated_by y no debe rechazarse aquí.
create
or replace function kit.prevent_memberships_update () returns trigger
set
  search_path = '' as $$
begin
    if new.user_id is distinct from old.user_id
        or new.account_id is distinct from old.account_id then
        raise exception 'Membership identity columns cannot be updated';
    end if;

    return new;

end; $$ language plpgsql;

create
or replace trigger prevent_memberships_update_check before
update on public.accounts_memberships for each row
execute function kit.prevent_memberships_update ();

-- Función `public.has_role_on_account`: indica si el usuario actual es miembro
-- de la cuenta y, si se indica un rol, si lo tiene.
-- Es `security definer` porque las políticas RLS de accounts_memberships la
-- invocan: si se ejecutase con los permisos del usuario, la consulta volvería
-- a evaluar esas mismas políticas y entraría en recursión infinita. Es segura
-- porque solo consulta las membresías del propio auth.uid().
create
or replace function public.has_role_on_account (
  account_id uuid,
  account_role varchar(50) default null
) returns boolean language sql security definer
set
  search_path = '' as $$
    select
        exists(
            select
                1
            from
                public.accounts_memberships membership
            where
                membership.user_id = (select auth.uid())
                and membership.account_id = has_role_on_account.account_id
                and((membership.account_role = has_role_on_account.account_role
                    or has_role_on_account.account_role is null)));
$$;

grant
execute on function public.has_role_on_account (uuid, varchar) to authenticated;

-- Función `public.is_team_member`: indica si `user_id` es miembro de la cuenta,
-- siempre que el usuario actual también lo sea (así no sirve para averiguar
-- la pertenencia a equipos ajenos). Es `security definer` por el mismo motivo
-- de recursión que la anterior.
create
or replace function public.is_team_member (account_id uuid, user_id uuid) returns boolean language sql security definer
set
  search_path = '' as $$
    select
        exists(
            select
                1
            from
                public.accounts_memberships membership
            where
                public.has_role_on_account(account_id)
                and membership.user_id = is_team_member.user_id
                and membership.account_id = is_team_member.account_id);
$$;

grant
execute on function public.is_team_member (uuid, uuid) to authenticated,
service_role;

-- Política SELECT sobre roles: cualquier usuario autenticado puede leer el
-- catálogo de roles, que no contiene datos de ningún tenant.
create policy roles_read on public.roles for
select
  to authenticated using (
    true
  );

-- Función `public.can_action_account_member`: comprueba si el usuario actual
-- puede gestionar (cambiar de rol o expulsar) a otro miembro. Lo permite si es
-- el propietario principal, o si tiene el permiso `members.manage` y una
-- jerarquía estrictamente superior a la del miembro afectado; nunca sobre el
-- propietario principal ni sobre uno mismo.
create
or replace function public.can_action_account_member (target_team_account_id uuid, target_user_id uuid) returns boolean
set
  search_path = '' as $$
declare
    permission_granted boolean;
    target_user_hierarchy_level int;
    current_user_hierarchy_level int;
    is_account_owner boolean;
    target_user_role varchar(50);
begin
    if target_user_id = auth.uid() then
      raise exception 'You cannot update your own account membership with this function';
    end if;

    -- an account owner can action any member of the account
    if public.is_account_owner(target_team_account_id) then
      return true;
    end if;

     -- check the target user is the primary owner of the account
    select
        exists (
            select
                1
            from
                public.accounts
            where
                id = target_team_account_id
                and primary_owner_user_id = target_user_id) into is_account_owner;

    if is_account_owner then
        raise exception 'The primary account owner cannot be actioned';
    end if;

    -- validate the auth user has the required permission on the account
    -- to manage members of the account
    select
 public.has_permission(auth.uid(), target_team_account_id,
     'members.manage'::public.app_permissions) into
     permission_granted;

    -- if the user does not have the required permission, raise an exception
    if not permission_granted then
      raise exception 'You do not have permission to action a member from this account';
    end if;

    -- get the role of the target user
    select
        am.account_role,
        r.hierarchy_level
    from
        public.accounts_memberships as am
    join
        public.roles as r on am.account_role = r.name
    where
        am.account_id = target_team_account_id
        and am.user_id = target_user_id
    into target_user_role, target_user_hierarchy_level;

    -- get the hierarchy level of the current user
    select
        r.hierarchy_level into current_user_hierarchy_level
    from
        public.roles as r
    join
        public.accounts_memberships as am on r.name = am.account_role
    where
        am.account_id = target_team_account_id
        and am.user_id = auth.uid();

    if target_user_role is null then
      raise exception 'The target user does not have a role on the account';
    end if;

    if current_user_hierarchy_level is null then
      raise exception 'The current user does not have a role on the account';
    end if;

    -- check the current user has a higher role than the target user
    if current_user_hierarchy_level >= target_user_hierarchy_level then
      raise exception 'You do not have permission to action a member from this account';
    end if;

    return true;

end;

$$ language plpgsql;

grant
execute on function public.can_action_account_member (uuid, uuid) to authenticated,
service_role;

-- Política SELECT sobre accounts_memberships: un usuario ve sus propias
-- membresías y las de los demás miembros de sus equipos, pero nunca las de
-- equipos a los que no pertenece.
create policy accounts_memberships_read on public.accounts_memberships for
select
  to authenticated using (
    (
      (
        select
          auth.uid ()
      ) = user_id
    )
    or is_team_member (account_id, user_id)
  );

-- Función `public.is_account_team_member`: indica si la cuenta indicada
-- (normalmente la personal de otro usuario) pertenece a alguien que comparte
-- equipo con el usuario actual. Permite ver el nombre y el avatar de los
-- compañeros sin exponer el resto de cuentas personales.
create
or replace function public.is_account_team_member (target_account_id uuid) returns boolean
set
  search_path = '' as $$
    select exists(
        select 1
        from public.accounts_memberships as membership
        where public.is_team_member (membership.account_id, target_account_id)
    );
$$ language sql;

grant
execute on function public.is_account_team_member (uuid) to authenticated,
service_role;

-- Política SELECT sobre accounts: un usuario puede leer una cuenta si
--   - es su propietario principal,
--   - tiene un rol en ella (es miembro del equipo), o
--   - es la cuenta personal de un compañero de alguno de sus equipos.
create policy accounts_read on public.accounts for
select
  to authenticated using (
    (
      (
        select
          auth.uid ()
      ) = primary_owner_user_id
    )
    or public.has_role_on_account (id)
    or public.is_account_team_member (id)
  );

-- Política DELETE sobre accounts_memberships: un usuario puede abandonar un
-- equipo (borrar su propia membresía) y, si can_action_account_member lo
-- permite, expulsar a otros miembros.
create policy accounts_memberships_delete on public.accounts_memberships for delete to authenticated using (
  (
    user_id = (
      select
        auth.uid ()
    )
  )
  or public.can_action_account_member (account_id, user_id)
);