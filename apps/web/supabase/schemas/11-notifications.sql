
/**
 * -------------------------------------------------------
 * Sección: Notificaciones
 * Avisos dirigidos a una cuenta (personal o de equipo) que se muestran en la
 * aplicación o se envían por correo. Los crea el servidor con el cliente
 * administrador; los usuarios solo pueden leerlos y marcarlos como vistos.
 * La tabla se publica en Supabase Realtime para que la campana de
 * notificaciones se actualice sin recargar.
 * -------------------------------------------------------
 */
create type public.notification_channel as enum('in_app', 'email');

create type public.notification_type as enum('info', 'warning', 'error');

create table if not exists
  public.notifications (
    id bigint generated always as identity primary key,
    account_id uuid not null references public.accounts (id) on delete cascade,
    type public.notification_type not null default 'info',
    body varchar(5000) not null,
    link varchar(255),
    channel public.notification_channel not null default 'in_app',
    dismissed boolean not null default false,
    expires_at timestamptz default (now() + interval '1 month'),
    created_at timestamptz not null default now(),
    check (expires_at is null or expires_at > created_at)
  );

comment on table notifications is 'The notifications for an account';

comment on column notifications.account_id is 'The account the notification is for';

comment on column notifications.type is 'The type of the notification';

comment on column notifications.body is 'The body of the notification';

comment on column notifications.link is 'The link for the notification';

comment on column notifications.channel is 'The channel for the notification';

comment on column notifications.dismissed is 'Whether the notification has been dismissed';

comment on column notifications.expires_at is 'The expiry date for the notification';

comment on column notifications.created_at is 'The creation date for the notification';

-- Se retiran todos los permisos para concederlos después de forma explícita.
revoke all on public.notifications
from
  anon,
  authenticated,
  service_role;

-- Lectura para usuarios autenticados (filtrada por la RLS) y para service_role.
grant
select
  on table public.notifications to authenticated,
service_role;

-- service_role conserva UPDATE sobre toda la tabla.
grant
update on table public.notifications to service_role;

-- authenticated solo puede cambiar la marca `dismissed`. El resto de columnas
-- (account_id, type, body, link, channel, expires_at, created_at) las gestiona
-- el sistema. Postgres lo impide de entrada, además del disparador
-- kit.update_notification_dismissed_status.
grant
update (dismissed) on table public.notifications to authenticated;

grant insert,
delete on table public.notifications to service_role;

-- Publica los cambios de la tabla en Realtime. La RLS también se aplica a las
-- suscripciones de Realtime, así que cada usuario solo recibe las suyas.
alter publication supabase_realtime
add table public.notifications;

-- Índice para obtener las notificaciones de una cuenta no descartadas y no
-- caducadas, que es la consulta de la campana.
create index idx_notifications_account_dismissed on notifications (account_id, dismissed, expires_at);

create index idx_notifications_account_created_at on notifications (account_id, created_at desc);

-- RLS activada sobre notifications.
alter table public.notifications enable row level security;

-- Política SELECT: un usuario ve las notificaciones de su cuenta personal y de
-- los equipos de los que es miembro.
create policy notifications_read_self on public.notifications for
select
  to authenticated using (
    account_id = (
      select
        auth.uid ()
    )
    or has_role_on_account (account_id)
  );

-- Política UPDATE: con el mismo alcance, un usuario puede marcarlas como
-- vistas (el permiso por columna limita el cambio a `dismissed`).
create policy notifications_update_self on public.notifications
for update
  to authenticated using (
    account_id = (
      select
        auth.uid ()
    )
    or has_role_on_account (account_id)
  );

-- Función `kit.update_notification_dismissed_status`: segunda barrera que
-- garantiza que un UPDATE solo cambie `dismissed`; si cambia cualquier otra
-- columna, lanza una excepción.
create
or replace function kit.update_notification_dismissed_status () returns trigger
set
  search_path to '' as $$
begin
    old.dismissed := new.dismissed;

    if (new is distinct from old) then
         raise exception 'UPDATE of columns other than "dismissed" is forbidden';
    end if;

    return old;
end;
$$ language plpgsql;

-- Se ejecuta antes de cada UPDATE de una notificación.
create trigger update_notification_dismissed_status before
update on public.notifications for each row
execute procedure kit.update_notification_dismissed_status ();
