/*
 * -------------------------------------------------------
 * Sección: Vistas y funciones de espacio de trabajo
 * Consultas agregadas que cargan de una vez los datos que necesita la
 * interfaz para pintar el espacio de trabajo del usuario (su cuenta
 * personal, la lista de equipos y el detalle de un equipo).
 * -------------------------------------------------------
 */


--
-- Vista `user_account_workspace`: datos de la cuenta personal del usuario
-- autenticado y el estado de su última suscripción.
-- Usa `security_invoker = true` para que la vista se evalúe con los permisos
-- de quien la consulta y se apliquen las políticas RLS de las tablas; sin
-- esa opción, la vista se ejecutaría con los permisos de su propietario y se
-- saltaría la RLS.
create or replace view
    public.user_account_workspace
            with
            (security_invoker = true) as
select
    accounts.id as id,
    accounts.name as name,
    accounts.picture_url as picture_url,
    accounts.public_data as public_data,
    (
        select
            status
        from
            public.subscriptions
        where
            account_id = accounts.id
        order by
            created_at desc
        limit
            1
    ) as subscription_status
from
    public.accounts
where
    primary_owner_user_id = (select auth.uid ())
  and accounts.is_personal_account = true
limit
    1;

grant
    select
    on public.user_account_workspace to authenticated,
    service_role;

--
-- Vista `user_accounts`: equipos de los que es miembro el usuario, con su rol
-- en cada uno; alimenta el selector de cuentas. También es `security_invoker`
-- por el mismo motivo.
create or replace view
    public.user_accounts (id, name, picture_url, slug, role, public_data)
        with
        (security_invoker = true) as
select
    account.id,
    account.name,
    account.picture_url,
    account.slug,
    membership.account_role,
    account.public_data
from
    public.accounts account
        join public.accounts_memberships membership on account.id = membership.account_id
where
    membership.user_id = (select auth.uid ())
  and account.is_personal_account = false
  and account.id in (
    select
        account_id
    from
        public.accounts_memberships
    where
        user_id = (select auth.uid ())
);

grant
    select
    on public.user_accounts to authenticated,
    service_role;

--
-- Función `public.team_account_workspace`: carga todos los datos de un equipo
-- (por slug) que necesita la interfaz: rol y jerarquía del usuario, permisos
-- y estado de la suscripción. Filtra por auth.uid(), así que solo devuelve
-- algo si el usuario es miembro.
create or replace function public.team_account_workspace(account_slug text)
returns table (
    id uuid,
    name varchar(255),
    picture_url varchar(1000),
    slug text,
    role varchar(50),
    role_hierarchy_level int,
    primary_owner_user_id uuid,
    public_data jsonb,
    subscription_status public.subscription_status,
    permissions public.app_permissions[]
)
set search_path to ''
as $$
begin
    return QUERY
    select
        accounts.id,
        accounts.name,
        accounts.picture_url,
        accounts.slug,
        accounts_memberships.account_role,
        roles.hierarchy_level,
        accounts.primary_owner_user_id,
        accounts.public_data,
        subscriptions.status,
        array_agg(role_permissions.permission)
    from
        public.accounts
        join public.accounts_memberships on accounts.id = accounts_memberships.account_id
        left join public.subscriptions on accounts.id = subscriptions.account_id
        join public.roles on accounts_memberships.account_role = roles.name
        left join public.role_permissions on accounts_memberships.account_role = role_permissions.role
    where
        accounts.slug = account_slug
        and public.accounts_memberships.user_id = (select auth.uid())
    group by
        accounts.id,
        accounts_memberships.account_role,
        accounts.public_data,
        subscriptions.status,
        roles.hierarchy_level;
end;
$$ language plpgsql;

grant
execute on function public.team_account_workspace (text) to authenticated,
service_role;
