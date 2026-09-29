# Ejemplos de la base de datos de PymeKit

Ejemplos reales (resumidos) de `apps/web/supabase/schemas/`. Antes de copiar uno, abre el fichero: es la fuente de verdad y puede haber cambiado. Para una tabla nueva, parte de la plantilla de `apps/web/supabase/AGENTS.md`, no de `accounts`.

## Cuentas (raíz del *tenant*)

Ubicación: `apps/web/supabase/schemas/03-accounts.sql`

```sql
create table if not exists public.accounts (
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

alter table "public"."accounts" enable row level security;
```

`accounts` es la raíz: en las cuentas personales su `id` coincide con el del usuario y lleva un `unique` redundante sobre `id`. No la uses como plantilla.

## Membresías

Ubicación: `apps/web/supabase/schemas/05-memberships.sql`

```sql
create table if not exists public.accounts_memberships (
  user_id uuid references auth.users on delete cascade not null,
  account_id uuid references public.accounts (id) on delete cascade not null,
  account_role varchar(50) references public.roles (name) not null,
  created_at timestamptz default current_timestamp not null,
  updated_at timestamptz default current_timestamp not null,
  created_by uuid references auth.users on delete set null,
  updated_by uuid references auth.users on delete set null,
  primary key (user_id, account_id)
);

-- Cada usuario ve sus propias membresías y las de los equipos a los que
-- pertenece; nunca las de equipos ajenos.
create policy accounts_memberships_read on public.accounts_memberships
  for select to authenticated using (
    (select auth.uid ()) = user_id
    or public.is_team_member (account_id, user_id)
  );
```

## Suscripciones

Ubicación: `apps/web/supabase/schemas/09-subscriptions.sql`

```sql
create table if not exists public.subscriptions (
  id text not null primary key,
  account_id uuid references public.accounts (id) on delete cascade not null,
  billing_customer_id int references public.billing_customers on delete cascade not null,
  status public.subscription_status not null,
  active bool not null,
  billing_provider public.billing_provider not null,
  cancel_at_period_end bool not null,
  currency varchar(3) not null check (currency ~ '^[A-Za-z]{3}$'),
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  period_starts_at timestamptz not null,
  period_ends_at timestamptz not null check (period_ends_at > period_starts_at),
  trial_starts_at timestamptz,
  trial_ends_at timestamptz
);

-- Los miembros ven la suscripción del equipo y el titular la de su cuenta
-- personal, pero solo si ese tipo de facturación está activado.
create policy subscriptions_read_self on public.subscriptions
  for select to authenticated using (
    (public.has_role_on_account (account_id)
      and public.is_set ('enable_team_account_billing'))
    or (account_id = (select auth.uid ())
      and public.is_set ('enable_account_billing'))
  );
```

## Notificaciones

Ubicación: `apps/web/supabase/schemas/11-notifications.sql`

```sql
create table if not exists public.notifications (
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

comment on table public.notifications is 'Notificaciones dirigidas a una cuenta';

-- Solo el titular de la cuenta personal o los miembros del equipo leen sus avisos.
create policy notifications_read_self on public.notifications
  for select to authenticated using (
    account_id = (select auth.uid ())
    or public.has_role_on_account (account_id)
  );
```

## *Bucket* de Storage

Ubicación: `apps/web/supabase/schemas/17-storage.sql` (una política por verbo)

```sql
insert into storage.buckets (id, name, public)
values ('account_image', 'account_image', true)
on conflict (id) do nothing;

-- Leer: el propietario de la imagen o cualquier miembro de la cuenta.
create policy account_image_select on storage.objects
  for select to authenticated using (
    bucket_id = 'account_image'
    and (
      kit.get_storage_filename_as_uuid (name) = auth.uid ()
      or public.has_role_on_account (kit.get_storage_filename_as_uuid (name))
    )
  );

-- Escribir: la membresía no basta; se exige el permiso settings.manage.
-- (Las políticas de update y delete siguen el mismo patrón.)
create policy account_image_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'account_image'
    and (
      kit.get_storage_filename_as_uuid (name) = auth.uid ()
      or public.has_permission (
        auth.uid (),
        kit.get_storage_filename_as_uuid (name),
        'settings.manage'
      )
    )
  );
```

## Tipos enumerados

Ubicación: `apps/web/supabase/schemas/01-enums.sql`

```sql
-- Permisos de la aplicación que se asignan a los roles de equipo
create type public.app_permissions as enum (
  'roles.manage',
  'billing.manage',
  'settings.manage',
  'members.manage',
  'invites.manage'
);

-- Estado de una suscripción, tal como lo informa el proveedor de pagos
create type public.subscription_status as enum (
  'active',
  'trialing',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused'
);
```
