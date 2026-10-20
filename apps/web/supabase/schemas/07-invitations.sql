/*
 * -------------------------------------------------------
 * Sección: Invitaciones
 * Invitaciones pendientes para unirse a una cuenta de equipo. Cada fila
 * guarda el email invitado, el rol que recibirá y un token secreto que
 * llega por correo; al aceptarla se convierte en una membresía. Incluye
 * columnas de entrega (envío, reintentos) para limitar el reenvío de
 * correos y evitar abusos.
 * -------------------------------------------------------
 */

create table if not exists
  public.invitations (
    id serial primary key,
    email varchar(255) not null check (length(trim(email)) > 3),
    account_id uuid references public.accounts (id) on delete cascade not null,
    invited_by uuid references auth.users on delete cascade not null,
    role varchar(50) references public.roles (name) not null,
    invite_token varchar(255) unique not null,
    created_at timestamptz default current_timestamp not null,
    updated_at timestamptz default current_timestamp not null,
    sent_at timestamptz,
    last_send_attempt_at timestamptz,
    resend_count integer default 0 not null check (resend_count >= 0),
    expires_at timestamptz default current_timestamp + interval '7 days' not null,
    check (sent_at is null or sent_at >= created_at),
    check (
      last_send_attempt_at is null
      or last_send_attempt_at >= created_at
    ),
    constraint invitations_expires_after_created check (expires_at > created_at),
    constraint invitations_email_format check (
      email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    ),
    unique (email, account_id)
  );

comment on table public.invitations is 'The invitations for an account';

comment on column public.invitations.account_id is 'The account the invitation is for';

comment on column public.invitations.invited_by is 'The user who invited the user';

comment on column public.invitations.role is 'The role for the invitation';

comment on column public.invitations.invite_token is 'The token for the invitation';

comment on column public.invitations.sent_at is 'The time the invitation email was successfully sent';

comment on column public.invitations.last_send_attempt_at is 'The most recent invitation email send attempt, used for resend rate limiting';

comment on column public.invitations.resend_count is 'The number of resend attempts made after the initial invitation email';

comment on column public.invitations.expires_at is 'The expiry date for the invitation';

comment on column public.invitations.email is 'The email of the user being invited';

-- Índices para listar las invitaciones de una cuenta, contar las vigentes y
-- las pendientes de envío, y aplicar el límite de reenvíos.
create index ix_invitations_account_id on public.invitations (account_id);

create index ix_invitations_invited_by on public.invitations (invited_by);

create index ix_invitations_account_expires_at on public.invitations (account_id, expires_at);

create index ix_invitations_unsent on public.invitations (account_id, created_at)
where
  sent_at is null;

create index ix_invitations_resend_rate_limit on public.invitations (id, last_send_attempt_at, resend_count);

-- Disparador de marcas de tiempo (definido en 02-config.sql).
create trigger invitations_set_timestamps
before insert or update on public.invitations
for each row execute function public.trigger_set_timestamps();

-- Se retiran todos los permisos para concederlos después de forma explícita.
revoke all on public.invitations
from
  anon,
  authenticated,
  service_role;

-- service_role conserva acceso completo: lo usa el cliente administrador en la
-- creación de invitaciones y en la ruta de aceptación.
grant
select
,
  insert,
update,
delete on table public.invitations to service_role;

-- `id` es serial, así que el INSERT necesita nextval() sobre su secuencia. Se
-- concede USAGE y no UPDATE, porque UPDATE permitiría también setval().
-- authenticated no inserta aquí, así que no necesita nada.
grant usage on sequence public.invitations_id_seq to service_role;

-- Los usuarios autenticados pueden actualizar y borrar (filtrado por la RLS),
-- pero NO pueden:
--   * insertar: las invitaciones solo se crean con add_invitations_to_account,
--     que se ejecuta con el cliente de service_role (no hay política INSERT);
--   * leer la columna invite_token: es una credencial y no debe exponerse por
--     la API a los miembros de la cuenta que invita. La ruta de aceptación la
--     lee con el cliente administrador. Es defensa en profundidad además de la
--     comprobación del enlace firmado (ver
--     @pymekit/team-accounts/invitation-signature).
grant delete on table public.invitations to authenticated;

-- authenticated solo puede actualizar el rol y la caducidad. Las columnas de
-- identidad y de entrega (id, email, account_id, invited_by, invite_token,
-- created_at, sent_at, last_send_attempt_at, resend_count) nunca las edita el
-- usuario: el flujo de reenvío las escribe con service_role. Postgres lo
-- impide de entrada, además del disparador
-- kit.protect_invitation_delivery_fields.
grant update (role, expires_at) on table public.invitations to authenticated;

-- Lectura por columnas: todas salvo invite_token (ver arriba).
grant
select
  (
    id,
    email,
    account_id,
    invited_by,
    role,
    created_at,
    updated_at,
    sent_at,
    last_send_attempt_at,
    resend_count,
    expires_at
  ) on table public.invitations to authenticated;

-- RLS activada: las políticas se definen más abajo.
alter table public.invitations enable row level security;

-- Función `kit.check_team_account`: solo se puede invitar a cuentas de equipo;
-- las cuentas personales no admiten más miembros.
create
or replace function kit.check_team_account () returns trigger
set
  search_path = '' as $$
begin
    if(
        select
            is_personal_account
        from
            public.accounts
        where
            id = new.account_id) then
        raise exception 'Account must be an team account';

    end if;

    return NEW;

end;

$$ language plpgsql;

create trigger only_team_accounts_check before insert
or
update on public.invitations for each row
execute procedure kit.check_team_account ();

-- Función `kit.protect_invitation_delivery_fields`: segunda barrera (tras el
-- permiso por columna) que impide a un usuario autenticado modificar las
-- columnas de identidad y de entrega de una invitación.
create
or replace function kit.protect_invitation_delivery_fields () returns trigger
set
  search_path = '' as $$
begin
    if current_user in('authenticated', 'anon') then
        if new.id is distinct from old.id
            or new.email is distinct from old.email
            or new.account_id is distinct from old.account_id
            or new.invited_by is distinct from old.invited_by
            or new.invite_token is distinct from old.invite_token
            or new.created_at is distinct from old.created_at
            or new.sent_at is distinct from old.sent_at
            or new.last_send_attempt_at is distinct from old.last_send_attempt_at
            or new.resend_count is distinct from old.resend_count then
            raise exception 'You do not have permission to update invitation delivery fields';
        end if;
    end if;

    return new;
end;
$$ language plpgsql;

create trigger protect_invitation_delivery_fields before
update on public.invitations for each row
execute function kit.protect_invitation_delivery_fields ();

-- Política SELECT: cualquier miembro de la cuenta puede ver sus invitaciones
-- pendientes (sin el token, que no tiene concedido por columna).
create policy invitations_read_self on public.invitations for
select
  to authenticated using (public.has_role_on_account (account_id));

-- INSERT: no hay política a propósito. Las invitaciones se crean desde el
-- servidor con el cliente administrador, después de comprobar en la
-- aplicación el permiso y la jerarquía de roles, para poder aplicar los
-- límites de cuota y frecuencia de add_invitations_to_account.

-- Política UPDATE: requiere el permiso `invites.manage` en la cuenta y que el
-- rol de la invitación sea inferior al del usuario, tanto antes como después
-- del cambio (así nadie puede "ascender" una invitación por encima de su
-- propio rol).
create policy invitations_update on public.invitations
for update
  to authenticated using (
    public.has_permission (
      (
        select
          auth.uid ()
      ),
      account_id,
      'invites.manage'::public.app_permissions
    )
    and public.has_more_elevated_role (
      (
        select
          auth.uid ()
      ),
      account_id,
      role
    )
  )
with
  check (
    public.has_permission (
      (
        select
          auth.uid ()
      ),
      account_id,
      'invites.manage'::public.app_permissions
    )
    and public.has_more_elevated_role (
      (
        select
          auth.uid ()
      ),
      account_id,
      role
    )
  );

-- Política DELETE: los miembros con el permiso `invites.manage` pueden
-- cancelar invitaciones de la cuenta.
create policy invitations_delete on public.invitations for delete to authenticated using (
  has_role_on_account (account_id)
  and public.has_permission (
    (
      select
        auth.uid ()
    ),
    account_id,
    'invites.manage'::public.app_permissions
  )
);

-- Función `public.accept_invitation`: canjea un token vigente, crea la
-- membresía con el rol de la invitación y borra la invitación, todo en una
-- transacción. Solo la ejecuta service_role: el usuario aún no es miembro, así
-- que no tendría permisos para insertar su membresía; la aplicación valida
-- antes la firma del enlace y que el email coincide.
create
or replace function accept_invitation (token text, user_id uuid) returns uuid
set
  search_path = '' as $$
declare
    target_account_id uuid;
    target_role varchar(50);
begin
    select
        account_id,
        role into target_account_id,
        target_role
    from
        public.invitations
    where
        invite_token = token
        and expires_at > now();

    if not found then
        raise exception 'Invalid or expired invitation token';
    end if;

    insert into public.accounts_memberships(
        user_id,
        account_id,
        account_role)
    values (
        accept_invitation.user_id,
        target_account_id,
        target_role);

    delete from public.invitations
    where invite_token = token;

    return target_account_id;
end;

$$ language plpgsql;

grant
execute on function accept_invitation (text, uuid) to service_role;

-- Función `public.create_invitation`: crea una invitación individual. No tiene
-- `grant` a authenticated, así que solo es ejecutable por roles privilegiados.
create
or replace function public.create_invitation (account_id uuid, email text, role varchar(50)) returns public.invitations
set
  search_path = '' as $$
declare
    new_invitation public.invitations;
    invite_token text;
begin
    invite_token := extensions.uuid_generate_v4();

    insert into public.invitations(
        email,
        account_id,
        invited_by,
        role,
        invite_token)
    values (
        email,
        account_id,
        auth.uid(),
        role,
        invite_token)
returning
    * into new_invitation;

    return new_invitation;

end;

$$ language plpgsql;


-- Función `public.get_account_invitations`: lista las invitaciones de una
-- cuenta por su slug junto con el nombre y el email de quien invitó. No es
-- `security definer`, de modo que la RLS limita el resultado a las cuentas de
-- las que el usuario es miembro.
create
or replace function public.get_account_invitations (account_slug text) returns table (
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
    select
        invitation.id,
        invitation.email,
        invitation.account_id,
        invitation.invited_by,
        invitation.role,
        invitation.created_at,
        invitation.updated_at,
        invitation.sent_at,
        invitation.last_send_attempt_at,
        invitation.resend_count,
        invitation.expires_at,
        inviter.name,
        inviter.email
    from
        public.invitations as invitation
        join public.accounts as account on invitation.account_id = account.id
        -- the inviter's personal account shares its id with the auth user
        left join public.accounts as inviter on invitation.invited_by = inviter.id
    where
        account.slug = account_slug;

end;

$$ language plpgsql;

grant
execute on function public.get_account_invitations (text) to authenticated,
service_role;

-- Función `public.add_invitations_to_account`: crea un lote de invitaciones.
-- Aplica de forma atómica dos límites contra abusos (un bloqueo consultivo por
-- cuenta serializa los lotes concurrentes para que los recuentos no puedan
-- saltarse con carreras):
--   * una cuota de invitaciones vigentes (no caducadas), y
--   * un límite de invitaciones creadas en una ventana móvil.
-- Los límites están fijados aquí (plpgsql no puede importar TypeScript); hay que
-- mantenerlos sincronizados con MAX_PENDING_INVITATIONS_PER_ACCOUNT,
-- INVITATION_CREATE_RATE_LIMIT e INVITATION_CREATE_RATE_WINDOW_MINUTES de
-- invite-members.schema.ts.
create
or replace function public.add_invitations_to_account (
  account_slug text,
  invitations public.invitation[],
  invited_by uuid
) returns public.invitations[]
set
  search_path = '' as $$
declare
    new_invitation public.invitations;
    all_invitations public.invitations[] := array[]::public.invitations[];
    invite_token text;
    email text;
    role varchar(50);
    target_account_id uuid;
    batch_size integer := coalesce(array_length(invitations, 1), 0);
    pending_count integer;
    recent_count integer;
begin
    select
        id into target_account_id
    from
        public.accounts
    where
        slug = account_slug;

    if target_account_id is null then
        raise exception 'Account not found';
    end if;

    -- Serialize concurrent invitation batches for this account so the limit
    -- checks below are race-free within the transaction.
    perform
        pg_advisory_xact_lock(hashtext('invitations:' || target_account_id::text));

    -- Quota: cap the number of outstanding (non-expired) invitations.
    select
        count(*) into pending_count
    from
        public.invitations
    where
        account_id = target_account_id
        and expires_at > now();

    if pending_count + batch_size > 50 then
        raise exception 'Account has reached the maximum number of pending invitations';
    end if;

    -- Rate limit: cap the number of invitations created per rolling 60-minute
    -- window.
    select
        count(*) into recent_count
    from
        public.invitations
    where
        account_id = target_account_id
        and created_at > now() - interval '60 minutes';

    if recent_count + batch_size > 20 then
        raise exception 'Invitation rate limit reached. Please try again later.';
    end if;

    FOREACH email,
    role in array invitations loop
        invite_token := extensions.uuid_generate_v4();

        insert into public.invitations(
            email,
            account_id,
            invited_by,
            role,
            invite_token)
        values (
            email,
            target_account_id,
            invited_by,
            role,
            invite_token)
    returning
        * into new_invitation;

        all_invitations := array_append(all_invitations, new_invitation);

    end loop;

    return all_invitations;

end;

$$ language plpgsql;

grant
execute on function public.add_invitations_to_account (text, public.invitation[], uuid) to service_role;
