/*
 * -------------------------------------------------------
 * Sección: Tipos enumerados
 * Define los `enum` compartidos por el resto del esquema (permisos de rol,
 * estados de suscripción y pago, proveedor de cobro...). Usar tipos
 * enumerados en lugar de texto libre hace que la base de datos rechace
 * valores no previstos y que los tipos generados para TypeScript sean
 * uniones cerradas.
 * -------------------------------------------------------
 */

/*
 * Permisos de la aplicación.
 * Son los permisos que se asignan a los roles de equipo (ver
 * `role_permissions`) y que comprueban las políticas RLS mediante
 * `has_permission`. Se pueden añadir valores nuevos si una funcionalidad
 * necesita un permiso propio.
 */
create type public.app_permissions as enum(
  'roles.manage',
  'billing.manage',
  'settings.manage',
  'members.manage',
  'invites.manage'
);

/*
 * Estado de una suscripción.
 * Refleja los estados que puede comunicar el proveedor de cobro en sus
 * *webhooks*; la aplicación decide a partir de él si una cuenta tiene acceso
 * a las funciones de pago.
 */
create type public.subscription_status as ENUM(
  'active',
  'trialing',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused'
);

/*
 * Estado de un pago único (pedido).
 */
create type public.payment_status as ENUM('pending', 'succeeded', 'failed');

/*
 * Proveedor de cobro.
 * De momento solo Stripe; añadir otro proveedor exige ampliar este `enum` e
 * implementar su pasarela en `packages/billing`.
 */
create type public.billing_provider as ENUM('stripe');

/*
 * Tipo de línea de suscripción: tarifa plana, por puesto (número de miembros)
 * o por consumo medido.
 */
create type public.subscription_item_type as ENUM('flat', 'per_seat', 'metered');

/*
 * Tipo compuesto para las invitaciones: pareja (email, rol) que reciben las
 * funciones que crean invitaciones en lote.
 */
create type public.invitation as (email text, role varchar(50));