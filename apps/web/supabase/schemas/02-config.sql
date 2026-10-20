/*
 * -------------------------------------------------------
 * Sección: Configuración de la aplicación
 * Tabla de una sola fila con los interruptores globales de la plataforma
 * (cuentas de equipo, cobro personal o de equipo, proveedor de cobro). Las
 * políticas y funciones de otros ficheros la consultan con `is_set` para
 * activar o desactivar funcionalidades sin cambiar el código. También define
 * los disparadores genéricos de marcas de tiempo y de autoría que reutilizan
 * las demás tablas.
 * -------------------------------------------------------
 */

create table if not exists
  public.config (
    enable_team_accounts boolean default true not null,
    enable_account_billing boolean default true not null,
    enable_team_account_billing boolean default true not null,
    billing_provider public.billing_provider default 'stripe' not null
  );

-- El índice único sobre una expresión constante garantiza que solo pueda
-- existir una fila de configuración global.
create unique index if not exists config_singleton on public.config ((true));

comment on table public.config is 'Configuration for the PymeKit.';

comment on column public.config.enable_team_accounts is 'Enable team accounts';

comment on column public.config.enable_account_billing is 'Enable billing for individual accounts';

comment on column public.config.enable_team_account_billing is 'Enable billing for team accounts';

comment on column public.config.billing_provider is 'The billing provider to use';

-- La RLS se activa aunque la tabla sea de solo lectura: sin política, nadie
-- podría leerla a través de la API.
alter table public.config enable row level security;

-- Fila inicial con todas las funcionalidades activadas.
insert into
  public.config (
    enable_team_accounts,
    enable_account_billing,
    enable_team_account_billing
  )
values
  (true, true, true)
on conflict
do nothing;

-- Se parte de cero: ningún rol tiene permisos sobre la configuración...
revoke all on public.config
from
  anon,
  authenticated,
  service_role;

-- ...y solo se concede lectura. Nadie puede modificarla desde la API; los
-- cambios se hacen con migraciones.
grant
select
  on public.config to authenticated,
  service_role;

-- Política SELECT: cualquier usuario autenticado puede leer la configuración,
-- porque no contiene datos sensibles y la interfaz la necesita para mostrar u
-- ocultar funcionalidades.
create policy "public config can be read by authenticated users" on public.config for
select
  to authenticated using (true);

-- Devuelve la fila de configuración como JSON.
create
or replace function public.get_config () returns json
set
  search_path = '' as $$
declare
    result record;
begin
    select
        *
    from
        public.config
    limit 1 into result;

    return row_to_json(result);

end;

$$ language plpgsql;

-- Disparador genérico que fija `created_at` al insertar y `updated_at` en cada
-- cambio, e impide que se modifique `created_at` después.
create
or replace function public.trigger_set_timestamps () returns trigger
set
  search_path = '' as $$
begin
    if TG_OP = 'INSERT' then
        new.created_at = now();

        new.updated_at = now();

    else
        new.updated_at = now();

        new.created_at = old.created_at;

    end if;

    return NEW;

end
$$ language plpgsql;

-- Disparador genérico que rellena `created_by` y `updated_by` con el usuario
-- autenticado (auth.uid()).
-- `created_by` no cambia tras la inserción, con una excepción: la cascada
-- `on delete set null` desde auth.users, que llega aquí como un UPDATE lanzado
-- desde el disparador de integridad referencial (pg_trigger_depth() > 1) y que
-- pone a NULL una columna de autoría; ese cambio debe pasar sin tocarse. Si se
-- restaurase old.created_by, se desharía la cascada y el borrado del usuario
-- fallaría por la clave ajena; si se rellenase updated_by, la fila quedaría
-- atribuida a quien no es, o se volvería a escribir el id del propio usuario
-- borrado cuando el borrado se ejecuta con su JWT.
create
or replace function public.trigger_set_user_tracking () returns trigger
set
  search_path = '' as $$
begin
    if TG_OP = 'INSERT' then
        new.created_by = auth.uid();
        new.updated_by = auth.uid();

    elsif pg_trigger_depth() > 1
        and ((new.created_by is null and old.created_by is not null)
            or (new.updated_by is null and old.updated_by is not null)) then
        -- referential-integrity cascade: keep the null it set, nothing else
        if new.created_by is not null then
            new.created_by = old.created_by;
        end if;

    else
        new.updated_by = auth.uid();

        new.created_by = old.created_by;

    end if;

    return NEW;

end
$$ language plpgsql;

grant
execute on function public.get_config () to authenticated,
service_role;

-- Función `public.is_set`: indica si un interruptor de la configuración está
-- activado. Usa `format('%I')` para citar el nombre de la columna y evitar
-- inyección SQL en la consulta dinámica.
create
or replace function public.is_set (field_name text) returns boolean
set
  search_path = '' as $$
declare
    result boolean;
begin
    execute format('select %I from public.config limit 1', field_name) into result;

    return result;

end;

$$ language plpgsql;

grant
execute on function public.is_set (text) to authenticated;
