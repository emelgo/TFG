/*
 * -------------------------------------------------------
 * Sección: Suscripciones
 * Copia local del estado de las suscripciones de cada cuenta en el
 * proveedor de cobro. La fuente de verdad es el proveedor: estas tablas se
 * actualizan al recibir sus *webhooks* (con `upsert_subscription`) y sirven
 * para que la aplicación y la RLS decidan sin llamar a la API externa si una
 * cuenta tiene acceso a las funciones de pago.
 * -------------------------------------------------------
 */
-- Tabla de suscripciones; `id` es el identificador del proveedor.
create table if not exists
  public.subscriptions (
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
    trial_ends_at timestamptz,
    check (
      trial_starts_at is null
      or trial_ends_at is null
      or trial_ends_at >= trial_starts_at
    )
  );

comment on table public.subscriptions is 'The subscriptions for an account';

comment on column public.subscriptions.account_id is 'The account the subscription is for';

comment on column public.subscriptions.billing_provider is 'The provider of the subscription';

comment on column public.subscriptions.cancel_at_period_end is 'Whether the subscription will be canceled at the end of the period';

comment on column public.subscriptions.currency is 'The currency for the subscription';

comment on column public.subscriptions.status is 'The status of the subscription';

comment on column public.subscriptions.period_starts_at is 'The start of the current period for the subscription';

comment on column public.subscriptions.period_ends_at is 'The end of the current period for the subscription';

comment on column public.subscriptions.trial_starts_at is 'The start of the trial period for the subscription';

comment on column public.subscriptions.trial_ends_at is 'The end of the trial period for the subscription';

comment on column public.subscriptions.active is 'Whether the subscription is active';

comment on column public.subscriptions.billing_customer_id is 'The billing customer ID for the subscription';

-- Se retiran todos los permisos para concederlos después de forma explícita.
revoke all on public.subscriptions
from
  anon,
  authenticated,
  service_role;

-- Solo service_role escribe (desde los *webhooks*); los usuarios solo leen.
grant
select
,
  insert,
update,
delete on table public.subscriptions to service_role;

grant
select
  on table public.subscriptions to authenticated;

-- Índices por cuenta, por cliente y parcial para las suscripciones activas,
-- que es la consulta más frecuente.
create index ix_subscriptions_account_id on public.subscriptions (account_id);

create index ix_subscriptions_billing_customer_id on public.subscriptions (billing_customer_id);

create index ix_subscriptions_active_account_id on public.subscriptions (account_id)
where
  active = true;

-- Disparador de marcas de tiempo (definido en 02-config.sql).
create trigger subscriptions_set_timestamps
before insert or update on public.subscriptions
for each row execute function public.trigger_set_timestamps();

-- RLS activada sobre subscriptions.
alter table public.subscriptions enable row level security;

-- Política SELECT: un usuario ve las suscripciones de los equipos de los que
-- es miembro y la de su cuenta personal, siempre que el cobro de ese tipo de
-- cuenta esté activado en la configuración global.
create policy subscriptions_read_self on public.subscriptions for
select
  to authenticated using (
    (
      has_role_on_account (account_id)
      and public.is_set ('enable_team_account_billing')
    )
    or (
      account_id = (
        select
          auth.uid ()
      )
      and public.is_set ('enable_account_billing')
    )
  );

-- Función `public.upsert_subscription`: inserta o actualiza en una única
-- transacción el cliente, la suscripción y sus líneas a partir de un *webhook*
-- del proveedor, borrando las líneas que ya no vengan en `line_items`. Solo la
-- ejecuta service_role: el *webhook* se verifica antes en el servidor con la
-- firma del proveedor.
create
or replace function public.upsert_subscription (
  target_account_id uuid,
  target_customer_id varchar(255),
  target_subscription_id text,
  active bool,
  status public.subscription_status,
  billing_provider public.billing_provider,
  cancel_at_period_end bool,
  currency varchar(3),
  period_starts_at timestamptz,
  period_ends_at timestamptz,
  line_items jsonb,
  trial_starts_at timestamptz default null,
  trial_ends_at timestamptz default null
) returns public.subscriptions
set
  search_path = '' as $$
declare
    new_subscription public.subscriptions;
    new_billing_customer_id int;
begin
    insert into public.billing_customers(
        account_id,
        provider,
        customer_id)
    values (
        target_account_id,
        billing_provider,
        target_customer_id)
on conflict (
    account_id,
    provider,
    customer_id)
    do update set
        provider = excluded.provider
    returning
        id into new_billing_customer_id;

    insert into public.subscriptions(
        account_id,
        billing_customer_id,
        id,
        active,
        status,
        billing_provider,
        cancel_at_period_end,
        currency,
        period_starts_at,
        period_ends_at,
        trial_starts_at,
        trial_ends_at)
    values (
        target_account_id,
        new_billing_customer_id,
        target_subscription_id,
        active,
        status,
        billing_provider,
        cancel_at_period_end,
        currency,
        period_starts_at,
        period_ends_at,
        trial_starts_at,
        trial_ends_at)
on conflict (
    id)
    do update set
        active = excluded.active,
        status = excluded.status,
        cancel_at_period_end = excluded.cancel_at_period_end,
        currency = excluded.currency,
        period_starts_at = excluded.period_starts_at,
        period_ends_at = excluded.period_ends_at,
        trial_starts_at = excluded.trial_starts_at,
        trial_ends_at = excluded.trial_ends_at
    returning
        * into new_subscription;

    -- Upsert subscription items and delete ones that are not in the line_items array
    with item_data as (
        select
            (line_item ->> 'id')::varchar as line_item_id,
            (line_item ->> 'product_id')::varchar as prod_id,
            (line_item ->> 'variant_id')::varchar as var_id,
            (line_item ->> 'type')::public.subscription_item_type as type,
            (line_item ->> 'price_amount')::numeric as price_amt,
            (line_item ->> 'quantity')::integer as qty,
            (line_item ->> 'interval')::varchar as intv,
            (line_item ->> 'interval_count')::integer as intv_count
        from
            jsonb_array_elements(line_items) as line_item
    ),
    line_item_ids as (
        select line_item_id from item_data
    ),
    deleted_items as (
        delete from
            public.subscription_items
        where
            public.subscription_items.subscription_id = new_subscription.id
            and public.subscription_items.id not in (select line_item_id from line_item_ids)
        returning *
    )
    insert into public.subscription_items(
        id,
        subscription_id,
        product_id,
        variant_id,
        type,
        price_amount,
        quantity,
        interval,
        interval_count)
    select
        line_item_id,
        target_subscription_id,
        prod_id,
        var_id,
        type,
        price_amt,
        qty,
        intv,
        intv_count
    from
        item_data
    on conflict (id)
        do update set
            product_id = excluded.product_id,
            variant_id = excluded.variant_id,
            price_amount = excluded.price_amount,
            quantity = excluded.quantity,
            interval = excluded.interval,
            type = excluded.type,
            interval_count = excluded.interval_count;

    return new_subscription;

end;

$$ language plpgsql;

grant
execute on function public.upsert_subscription (
  uuid,
  varchar,
  text,
  bool,
  public.subscription_status,
  public.billing_provider,
  bool,
  varchar,
  timestamptz,
  timestamptz,
  jsonb,
  timestamptz,
  timestamptz
) to service_role;

/* -------------------------------------------------------
 * Sección: Líneas de suscripción
 * Cada línea es un producto y variante (precio) de la suscripción, con su
 * tipo (plana, por puesto o por consumo), cantidad e intervalo de cobro.
 * -------------------------------------------------------
 */
create table if not exists
  public.subscription_items (
    id varchar(255) not null primary key,
    subscription_id text references public.subscriptions (id) on delete cascade not null,
    product_id varchar(255) not null,
    variant_id varchar(255) not null,
    type public.subscription_item_type not null,
    price_amount numeric,
    quantity integer not null default 1 check (quantity > 0),
    interval varchar(255) not null,
    interval_count integer not null check (interval_count > 0),
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp,
    unique (subscription_id, product_id, variant_id)
  );

comment on table public.subscription_items is 'The items in a subscription';

comment on column public.subscription_items.subscription_id is 'The subscription the item is for';

comment on column public.subscription_items.product_id is 'The product ID for the item';

comment on column public.subscription_items.variant_id is 'The variant ID for the item';

comment on column public.subscription_items.price_amount is 'The price amount for the item';

comment on column public.subscription_items.quantity is 'The quantity of the item';

comment on column public.subscription_items.interval is 'The interval for the item';

comment on column public.subscription_items.interval_count is 'The interval count for the item';

comment on column public.subscription_items.created_at is 'The creation date of the item';

comment on column public.subscription_items.updated_at is 'The last update date of the item';

-- Se retiran todos los permisos para concederlos después de forma explícita.
revoke all on public.subscription_items
from
  anon,
  authenticated,
  service_role;

-- Los usuarios autenticados solo leen; service_role escribe desde los
-- *webhooks*.
grant
select
  on table public.subscription_items to authenticated,
  service_role;

grant insert,
update,
delete on table public.subscription_items to service_role;

-- Índices por suscripción y por producto/variante.
create index ix_subscription_items_subscription_id on public.subscription_items (subscription_id);

create index ix_subscription_items_product_variant on public.subscription_items (product_id, variant_id);

-- Disparador de marcas de tiempo (definido en 02-config.sql).
create trigger subscription_items_set_timestamps
before insert or update on public.subscription_items
for each row execute function public.trigger_set_timestamps();

-- RLS activada sobre subscription_items.
alter table public.subscription_items enable row level security;

-- Política SELECT: un usuario ve las líneas de las suscripciones que puede
-- ver (las de su cuenta personal y las de sus equipos).
create policy subscription_items_read_self on public.subscription_items for
select
  to authenticated using (
    exists (
      select
        1
      from
        public.subscriptions
      where
        id = subscription_id
        and (
          account_id = (
            select
              auth.uid ()
          )
          or has_role_on_account (account_id)
        )
    )
  );


-- Función `public.has_active_subscription`: indica si la cuenta tiene una
-- suscripción activa (activa o en periodo de prueba). Sirve para restringir el
-- acceso a funcionalidades de pago, también desde las políticas RLS.
create
or replace function public.has_active_subscription (target_account_id uuid) returns boolean
set
  search_path = '' as $$
begin
    return exists (
        select
            1
        from
            public.subscriptions
        where
            account_id = target_account_id
            and active = true);

end;

$$ language plpgsql;

grant
execute on function public.has_active_subscription (uuid) to authenticated,
service_role;
