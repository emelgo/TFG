/*
 * -------------------------------------------------------
 * Sección: Superadministrador
 * Políticas que dan al superadministrador de la plataforma (el operador del
 * SaaS, no el de una pyme) acceso de solo lectura a todas las tablas de
 * negocio para tareas de soporte. Son políticas permisivas: se suman con OR
 * a las de cada tabla. La condición `is_super_admin()` exige el rol en
 * `app_metadata` y una sesión `aal2` (ver 13-mfa.sql).
 * -------------------------------------------------------
 */

-- Cuentas.
create policy super_admins_access_accounts
    on public.accounts
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- Membresías.
create policy super_admins_access_accounts_memberships
    on public.accounts_memberships
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- Suscripciones.
create policy super_admins_access_subscriptions
    on public.subscriptions
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- Líneas de suscripción.
create policy super_admins_access_subscription_items
    on public.subscription_items
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- Invitaciones.
create policy super_admins_access_invitations
    on public.invitations
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- Pedidos.
create policy super_admins_access_orders
    on public.orders
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- Líneas de pedido.
create policy super_admins_access_order_items
    on public.order_items
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- Permisos de los roles.
create policy super_admins_access_role_permissions
    on public.role_permissions
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- Clientes de facturación.
create policy super_admins_access_billing_customers
    on public.billing_customers
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- Notificaciones.
create policy super_admins_access_notifications
    on public.notifications
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());
