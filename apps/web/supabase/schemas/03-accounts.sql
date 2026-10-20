/*
 * -------------------------------------------------------
 * Sección: Cuentas
 * La cuenta es la entidad raíz del modelo multi-tenant de PymeKit: todo dato
 * de negocio (suscripciones, pedidos, notificaciones, miembros...) cuelga de
 * una cuenta. Hay dos tipos: la cuenta personal, que se crea automáticamente
 * para cada usuario al registrarse, y la cuenta de equipo, que representa a
 * la pyme y agrupa a varios usuarios mediante `accounts_memberships`.
 * Este fichero define la tabla, sus permisos y RLS, la generación de `slug`
 * y las funciones de creación y transferencia de cuentas.
 * -------------------------------------------------------
 */

-- Tabla de cuentas. `id` coincide con el id del usuario en las cuentas
-- personales, de modo que una cuenta personal se localiza con auth.uid().
create table if not exists
  public.accounts (
    id uuid unique not null default extensions.uuid_generate_v4 (),
    primary_owner_user_id uuid references auth.users on delete cascade not null default auth.uid (),
    name varchar(255) not null check (length(trim(name)) > 0),
    slug text unique,
    email varchar(320) unique,
    is_personal_account boolean default false not null,
    updated_at timestamp with time zone,
    created_at timestamp with time zone,
    created_by uuid references auth.users on delete set null,
    updated_by uuid references auth.users on delete set null,
    picture_url varchar(1000),
    public_data jsonb default '{}'::jsonb not null,
    primary key (id)
  );

comment on table public.accounts is 'Accounts are the top level entity in the PymeKit. They can be team or personal accounts.';

comment on column public.accounts.is_personal_account is 'Whether the account is a personal account or not';

comment on column public.accounts.name is 'The name of the account';

comment on column public.accounts.slug is 'The slug of the account';

comment on column public.accounts.primary_owner_user_id is 'The primary owner of the account';

comment on column public.accounts.email is 'The email of the account. For teams, this is the email of the team (if any)';

-- Sin políticas, la RLS deniega todo acceso; cada operación permitida se abre
-- más abajo con una política concreta.
alter table "public"."accounts" enable row level security;

-- Se retiran todos los permisos para concederlos después de forma explícita.
revoke all on public.accounts
from
  anon,
  authenticated,
  service_role;

-- Permisos de tabla para usuarios autenticados.
-- authenticated no tiene INSERT: las cuentas solo las crean el disparador
-- kit.setup_new_user y la función create_team_account (ambos `security
-- definer`), así que este rol nunca inserta filas directamente.
grant
select
,
  delete on table public.accounts to authenticated;

grant
select
,
  insert,
  delete on table public.accounts to service_role;

-- service_role (cliente administrador) conserva UPDATE sobre toda la tabla,
-- incluidas las columnas de identidad y las gestionadas por el sistema.
grant
update on table public.accounts to service_role;

-- authenticated solo puede actualizar las columnas que de verdad edita el
-- usuario. Las columnas de identidad (id, primary_owner_user_id,
-- is_personal_account, email) las protege kit.protect_account_fields y no
-- deben cambiar nunca; las gestionadas por el sistema (created_at/updated_at,
-- created_by/updated_by) solo las escriben los disparadores o service_role.
-- `slug` sí es editable: al renombrar un equipo se actualiza directamente
-- (ver updateTeamAccountName).
-- Postgres aplica este permiso por columna antes que la RLS y el disparador
-- (defensa en profundidad).
-- Nota: los disparadores BEFORE que modifican marcas de tiempo o autoría en
-- NEW siguen funcionando, porque el permiso por columna se comprueba contra la
-- lista SET de la sentencia, no contra lo que escribe un disparador.
grant
update (name, slug, picture_url, public_data) on table public.accounts to authenticated;

-- Las cuentas personales no tienen slug (se identifican por el usuario) y las
-- de equipo siempre lo tienen, porque forma parte de su URL.
alter table public.accounts
add constraint accounts_slug_null_if_personal_account_true check (
  (
    is_personal_account = true
    and slug is null
  )
  or (
    is_personal_account = false
    and slug is not null
  )
);

alter table public.accounts
add constraint accounts_slug_format check (
  slug is null
  or (
    char_length(slug) <= 255
    and slug ~ '^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$'
  )
);

-- Índices para las búsquedas habituales por propietario y por tipo de cuenta.
create index if not exists ix_accounts_primary_owner_user_id on public.accounts (primary_owner_user_id);

create index if not exists ix_accounts_is_personal_account on public.accounts (is_personal_account);

-- Cada usuario tiene como máximo una cuenta personal.
create unique index unique_personal_account on public.accounts (primary_owner_user_id)
where
  is_personal_account = true;

-- Disparadores de marcas de tiempo y autoría (definidos en 02-config.sql).
create trigger accounts_set_timestamps
before insert or update on public.accounts
for each row execute function public.trigger_set_timestamps();

create trigger accounts_set_user_tracking
before insert or update on public.accounts
for each row execute function public.trigger_set_user_tracking();

-- Política UPDATE: solo el propietario principal puede modificar la cuenta
-- (sea personal o de equipo). El permiso por columna anterior limita además
-- qué campos puede tocar.
create policy accounts_self_update on public.accounts
for update
  to authenticated using (
    (
      select
        auth.uid ()
    ) = primary_owner_user_id
  )
with
  check (
    (
      select
        auth.uid ()
    ) = primary_owner_user_id
  );

-- Función `public.transfer_team_account_ownership`: transfiere la propiedad de
-- una cuenta de equipo a otro miembro y le asigna el rol de mayor jerarquía.
-- Solo la ejecuta service_role (ver el `grant` de abajo y la comprobación de
-- current_user dentro): la aplicación valida antes que quien la pide es el
-- propietario actual, normalmente tras verificar un token de un solo uso.
create
or replace function public.transfer_team_account_ownership (target_account_id uuid, new_owner_id uuid) returns void
set
  search_path = '' as $$
begin
    if current_user not in('service_role') then
        raise exception 'You do not have permission to transfer account ownership';
    end if;

    -- verify the user is already a member of the account
    if not exists(
        select
            1
        from
            public.accounts_memberships
        where
            target_account_id = account_id
            and user_id = new_owner_id) then
        raise exception 'The new owner must be a member of the account';
    end if;

    -- update the primary owner of the account
    update
        public.accounts
    set
        primary_owner_user_id = new_owner_id
    where
        id = target_account_id
        and is_personal_account = false;

    -- update membership assigning it the hierarchy role
    update
        public.accounts_memberships
    set
        account_role =(
            public.get_upper_system_role())
    where
        target_account_id = account_id
        and user_id = new_owner_id
        and account_role <>(
            public.get_upper_system_role());

end;

$$ language plpgsql;

grant
execute on function public.transfer_team_account_ownership (uuid, uuid) to service_role;

-- Función `public.is_account_owner`: indica si el usuario actual es el
-- propietario principal de la cuenta. La usan las políticas RLS de otras
-- tablas.
create
or replace function public.is_account_owner (account_id uuid) returns boolean
set
  search_path = '' as $$
    select
        exists(
            select
                1
            from
                public.accounts
            where
                id = is_account_owner.account_id
                and primary_owner_user_id = auth.uid());
$$ language sql;

grant
execute on function public.is_account_owner (uuid) to authenticated,
service_role;

-- Función `kit.protect_account_fields`: impide que un usuario autenticado
-- cambie las columnas de identidad de una cuenta, aunque la política UPDATE le
-- permita modificar la fila. service_role queda fuera de la comprobación.
create
or replace function kit.protect_account_fields () returns trigger as $$
begin
    if current_user in('authenticated', 'anon') then
	-- "is distinct from" treats NULL as a comparable value, so transitions
	-- between NULL and a value (email is nullable) are caught as well
	if new.id is distinct from old.id
	    or new.is_personal_account is distinct from old.is_personal_account
	    or new.primary_owner_user_id is distinct from old.primary_owner_user_id
	    or new.email is distinct from old.email then
            raise exception 'You do not have permission to update this field';

        end if;

    end if;

    return NEW;

end
$$ language plpgsql
set
  search_path = '';

-- Disparador que aplica la protección anterior en cada UPDATE.
create trigger protect_account_fields before
update on public.accounts for each row
execute function kit.protect_account_fields ();

-- Función `public.get_upper_system_role`: devuelve el rol con mayor jerarquía
-- (nivel 1, normalmente `owner`), que se asigna al propietario de un equipo.
create
or replace function public.get_upper_system_role () returns varchar
set
  search_path = '' as $$
declare
    role varchar(50);
begin
    select name from public.roles
      where hierarchy_level = 1 into role;

    return role;
end;
$$ language plpgsql;

grant
execute on function public.get_upper_system_role () to service_role;

-- Mantiene sincronizado el email de la cuenta personal cuando el usuario
-- cambia el suyo en auth.users. Es `security definer` porque se ejecuta desde
-- un disparador de auth.users, cuyo rol no tiene permisos sobre
-- public.accounts; solo actualiza la cuenta personal del propio usuario.
create
or replace function kit.handle_update_user_email () returns trigger language plpgsql security definer
set
  search_path = '' as $$
begin
    update
        public.accounts
    set
        email = new.email
    where
        primary_owner_user_id = new.id
        and is_personal_account = true;

    return new;

end;

$$;

-- Se dispara solo cuando cambia la columna email de auth.users.
create trigger "on_auth_user_updated"
after
update of email on auth.users for each row
execute procedure kit.handle_update_user_email ();


/**
 * -------------------------------------------------------
 * Sección: Generación de slugs
 * Funciones que convierten el nombre de un equipo en un `slug` apto para
 * URL (sin tildes, en minúsculas y con guiones) y garantizan que sea único
 * añadiendo un sufijo numérico si ya existe.
 * -------------------------------------------------------
 */
-- Función `kit.slugify`: convierte un texto en slug. Es `immutable`, porque
-- para la misma entrada siempre devuelve lo mismo.
create
or replace function kit.slugify ("value" text) returns text as $$
    -- removes accents (diacritic signs) from a given string --
    with "unaccented" as(
        select
            kit.unaccent("value") as "value"
),
-- lowercases the string
"lowercase" as(
    select
        lower("value") as "value"
    from
        "unaccented"
),
-- remove single and double quotes
"removed_quotes" as(
    select
	regexp_replace("value", '[''"]+', '',
	    'gi') as "value"
    from
        "lowercase"
),
-- replaces anything that's not a letter, number, hyphen('-'), or underscore('_') with a hyphen('-')
"hyphenated" as(
    select
	regexp_replace("value", '[^a-z0-9\\-_]+', '-',
	    'gi') as "value"
    from
        "removed_quotes"
),
-- trims hyphens('-') if they exist on the head or tail of
--   the string
"trimmed" as(
    select
	regexp_replace(regexp_replace("value", '\-+$',
	    ''), '^\-', '') as "value" from "hyphenated"
)
        select
            "value"
        from
            "trimmed";
$$ language SQL strict immutable
set
  search_path to '';

grant
execute on function kit.slugify (text) to service_role,
authenticated;


-- Función `kit.set_slug_from_account_name`: calcula el slug a partir del
-- nombre y, si ya existe en otra cuenta, prueba con "nombre 1", "nombre 2"...
-- Es `security definer` porque debe ver los slugs de todas las cuentas, no
-- solo las que la RLS deja ver al usuario, para garantizar la unicidad.
create
or replace function kit.set_slug_from_account_name () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
    tmp_slug varchar;
    increment integer;
    tmp_row_count integer;
begin
    tmp_row_count = 1;

    increment = 0;

    while tmp_row_count > 0 loop
        if increment > 0 then
            tmp_slug = kit.slugify(new.name || ' ' || increment::varchar);

        else
            tmp_slug = kit.slugify(new.name);

        end if;

        select count(1)
        from public.accounts
        where slug = tmp_slug
          and id <> new.id
        into tmp_row_count;

        increment = increment +1;

    end loop;

    new.slug := tmp_slug;

    return NEW;

end
$$;

-- Al crear un equipo sin slug explícito, se genera a partir del nombre.
create trigger "set_slug_from_account_name" before insert on public.accounts for each row when (
  NEW.name is not null
  and NEW.slug is null
  and NEW.is_personal_account = false
)
execute procedure kit.set_slug_from_account_name ();

-- Al renombrar un equipo, se regenera el slug.
create trigger "update_slug_from_account_name" before
update on public.accounts for each row when (
  NEW.name is not null
  and NEW.name <> OLD.name
  and NEW.is_personal_account = false
)
execute procedure kit.set_slug_from_account_name ();

-- Función `kit.setup_new_user`: crea la cuenta personal de cada usuario nuevo
-- con el nombre y el avatar de sus metadatos (o la parte local del email).
-- Es `security definer` porque se ejecuta desde un disparador de auth.users y
-- authenticated no tiene INSERT sobre public.accounts.
create
or replace function kit.setup_new_user () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
    user_name text;
    picture_url text;
begin
    if new.raw_user_meta_data ->> 'name' is not null then
        user_name := new.raw_user_meta_data ->> 'name';

    end if;

    if user_name is null and new.email is not null then
        user_name := split_part(new.email, '@', 1);

    end if;

    if user_name is null then
        user_name := '';

    end if;

    if new.raw_user_meta_data ->> 'avatar_url' is not null then
        picture_url := new.raw_user_meta_data ->> 'avatar_url';
    else
        picture_url := null;
    end if;

    insert into public.accounts(
        id,
        primary_owner_user_id,
        name,
        is_personal_account,
        picture_url,
        email)
    values (
        new.id,
        new.id,
        user_name,
        true,
        picture_url,
        new.email);

    return new;

end;

$$;

-- Se ejecuta tras cada alta en auth.users.
create trigger on_auth_user_created
after insert on auth.users for each row
execute procedure kit.setup_new_user ();

/**
 * -------------------------------------------------------
 * Sección: Funciones de cuentas de equipo
 * -------------------------------------------------------
 */
-- Función `public.create_team_account`: crea una cuenta de equipo y la
-- membresía de su propietario en una única transacción.
-- Es `security definer` para insertar en accounts y accounts_memberships sin
-- que el cliente tenga permisos directos sobre ambas tablas. Solo la puede
-- ejecutar service_role: la aplicación comprueba antes las políticas de
-- negocio (paquete de políticas) y después la llama con el cliente admin.
create
or replace function public.create_team_account (
    account_name text,
    user_id uuid,
    account_slug text default null
) returns public.accounts
language plpgsql
security definer
set
  search_path = '' as $$
declare
    new_account public.accounts;
    owner_role varchar(50);
begin
    if (not public.is_set('enable_team_accounts')) then
        raise exception 'Team accounts are not enabled';
    end if;

    -- Get the highest system role for the owner
    select public.get_upper_system_role() into owner_role;

    -- Insert the new team account
    -- The slug will be auto-generated from name by the "set_slug_from_account_name"
    -- trigger if account_slug is null
    insert into public.accounts(
        name,
        slug,
        is_personal_account,
        primary_owner_user_id)
    values (
        account_name,
        account_slug,
        false,
        user_id)
    returning * into new_account;

    -- Create membership for the owner (atomic with account creation)
    insert into public.accounts_memberships(
        account_id,
        user_id,
        account_role)
    values (
        new_account.id,
        user_id,
        coalesce(owner_role, 'owner'));

    return new_account;

end;

$$;

grant
execute on function public.create_team_account (text, uuid, text) to service_role;

-- Política DELETE: el propietario principal puede borrar sus cuentas de
-- equipo. Las personales quedan excluidas: se borran desde el flujo de
-- administración (auth.admin.deleteUser borra en cascada la cuenta), nunca
-- directamente por su dueño.
create policy delete_team_account
    on public.accounts
    for delete
    to authenticated
    using (
        auth.uid() = primary_owner_user_id
        and is_personal_account = false
    );

-- Función `public.get_account_members`: devuelve los miembros de una cuenta a
-- partir de su slug, con su rol y jerarquía. No es `security definer`, así
-- que la RLS de las tablas consultadas limita el resultado a las cuentas de
-- las que el usuario es miembro.
create
or replace function public.get_account_members (account_slug text) returns table (
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
) language plpgsql
set
  search_path = '' as $$
begin
    return QUERY
    select
        acc.id,
        am.user_id,
        am.account_id,
        am.account_role,
        r.hierarchy_level,
        a.primary_owner_user_id,
        acc.name,
        acc.email,
        acc.picture_url,
        am.created_at,
        am.updated_at
    from
        public.accounts_memberships am
        join public.accounts a on a.id = am.account_id
        join public.accounts acc on acc.id = am.user_id
        join public.roles r on r.name = am.account_role
    where
        a.slug = account_slug;

end;

$$;

grant
execute on function public.get_account_members (text) to authenticated,
service_role;
