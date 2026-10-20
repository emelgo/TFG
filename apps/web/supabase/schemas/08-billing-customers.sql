/*
 * -------------------------------------------------------
 * Sección: Clientes de facturación
 * Vincula cada cuenta de PymeKit con su cliente en el proveedor de cobro
 * (por ejemplo, el `cus_123` de Stripe). Lo escriben los *webhooks* del
 * proveedor con el cliente administrador; los usuarios solo pueden leerlo.
 * -------------------------------------------------------
 */
-- Tabla de clientes de facturación.
create table if not exists
  public.billing_customers (
    account_id uuid references public.accounts (id) on delete cascade not null,
    id serial primary key,
    email text check (email is null or length(trim(email)) > 3),
    provider public.billing_provider not null,
    customer_id text not null,
    unique (provider, customer_id),
    unique (account_id, customer_id, provider)
  );

comment on table public.billing_customers is 'The billing customers for an account';

comment on column public.billing_customers.account_id is 'The account the billing customer is for';

comment on column public.billing_customers.provider is 'The provider of the billing customer';

comment on column public.billing_customers.customer_id is 'The customer ID for the billing customer';

comment on column public.billing_customers.email is 'The email of the billing customer';

-- Índices para buscar por cuenta y por identificador del proveedor (este
-- último lo usan los *webhooks*).
create index ix_billing_customers_account_id on public.billing_customers (account_id);

create index ix_billing_customers_provider_customer_id on public.billing_customers (provider, customer_id);

-- Se retiran todos los permisos para concederlos después de forma explícita.
revoke all on public.billing_customers
from
  anon,
  authenticated,
  service_role;

-- Solo service_role escribe: los datos de cobro vienen siempre del proveedor
-- a través de los *webhooks*, nunca del usuario.
grant
select
,
  insert,
update,
delete on table public.billing_customers to service_role;

-- `id` es serial, así que el INSERT necesita nextval() sobre su secuencia. Se
-- concede USAGE y no UPDATE, porque UPDATE permitiría también setval().
-- authenticated no inserta aquí, así que no necesita nada.
grant usage on sequence public.billing_customers_id_seq to service_role;

-- Los usuarios autenticados solo pueden leer (filtrado por la RLS).
grant
select
  on table public.billing_customers to authenticated,
  service_role;

-- RLS activada sobre billing_customers.
alter table public.billing_customers enable row level security;

-- Política SELECT: un usuario ve el cliente de facturación de su cuenta
-- personal y el de los equipos de los que es miembro.
create policy billing_customers_read_self on public.billing_customers for
select
  to authenticated using (
    account_id = (
      select
        auth.uid ()
    )
    or has_role_on_account (account_id)
  );
