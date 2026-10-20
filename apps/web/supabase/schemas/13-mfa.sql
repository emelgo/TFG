/*
 * -------------------------------------------------------
 * Sección: Autenticación multifactor (MFA)
 * Funciones y políticas que obligan a respetar la MFA. Supabase Auth indica
 * en el JWT el nivel de garantía de la sesión (`aal1` con contraseña o
 * enlace mágico, `aal2` tras verificar un segundo factor). Si un usuario ha
 * activado la MFA, las políticas restrictivas de este fichero le niegan el
 * acceso a los datos hasta que su sesión llegue a `aal2`, aunque las
 * políticas permisivas de cada tabla lo permitieran.
 * -------------------------------------------------------
 */

/*
 * public.is_aal2
 * Indica si la sesión actual tiene nivel de garantía `aal2` (segundo factor
 * verificado).
 */
create
    or replace function public.is_aal2() returns boolean
    set
        search_path = '' as
$$
declare
    is_aal2 boolean;
begin
    select auth.jwt() ->> 'aal' = 'aal2' into is_aal2;

    return coalesce(is_aal2, false);
end
$$ language plpgsql;

-- Se concede a authenticated porque la usan las políticas RLS.
grant execute on function public.is_aal2() to authenticated;

/*
 * public.is_super_admin
 * Indica si el usuario es superadministrador: tiene el rol `super-admin` en
 * `app_metadata` (que solo puede escribir el servidor, no el propio usuario)
 * y, además, su sesión es `aal2`. Exigir MFA evita que una contraseña robada
 * baste para obtener acceso de administración.
 */
create
    or replace function public.is_super_admin() returns boolean
    set
        search_path = '' as
$$
declare
    is_super_admin boolean;
begin
    if not public.is_aal2() then
        return false;
    end if;

    select (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'super-admin' into is_super_admin;

    return coalesce(is_super_admin, false);
end
$$ language plpgsql;

-- Se concede a authenticated porque la usan las políticas RLS.
grant execute on function public.is_super_admin() to authenticated;

/*
 * public.is_mfa_compliant
 * Indica si la sesión cumple los requisitos de MFA: si el usuario tiene algún
 * factor verificado, su sesión debe ser `aal2`; si no, basta con `aal1`
 * (comportamiento normal).
 * Es `security definer` porque necesita leer auth.mfa_factors, a la que
 * authenticated no tiene acceso; solo consulta los factores del propio
 * auth.uid().
 */
create or replace function public.is_mfa_compliant() returns boolean
    set search_path = '' as
$$
begin
    return array[(select auth.jwt()->>'aal')] <@ (
        select
            case
                when count(id) > 0 then array['aal2']
                else array['aal1', 'aal2']
                end as aal
        from auth.mfa_factors
        where ((select auth.uid()) = auth.mfa_factors.user_id) and auth.mfa_factors.status = 'verified'
    );
end
$$ language plpgsql security definer;

-- Se concede a authenticated porque la usan las políticas RLS.
grant execute on function public.is_mfa_compliant() to authenticated;

-- Restricciones de MFA:
-- Las siguientes políticas son restrictivas (`as restrictive`): PostgreSQL las
-- combina con AND con las permisivas de cada tabla, así que no conceden nada
-- por sí mismas, solo pueden quitar acceso. A los usuarios sin MFA activada no
-- les afectan; a los que la tienen les bloquean el acceso a los datos de cada
-- tabla hasta completar el segundo factor.

-- Cuentas.
create policy restrict_mfa_accounts
    on public.accounts
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Membresías.
create policy restrict_mfa_accounts_memberships
    on public.accounts_memberships
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Suscripciones.
create policy restrict_mfa_subscriptions
    on public.subscriptions
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Líneas de suscripción.
create policy restrict_mfa_subscription_items
    on public.subscription_items
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Permisos de los roles.
create policy restrict_mfa_role_permissions
    on public.role_permissions
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Invitaciones.
create policy restrict_mfa_invitations
    on public.invitations
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Pedidos.
create policy restrict_mfa_orders
    on public.orders
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Líneas de pedido.
create policy restrict_mfa_order_items
    on public.order_items
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Notificaciones.
create policy restrict_mfa_notifications
    on public.notifications
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Clientes de facturación.
create policy restrict_mfa_billing_customers
    on public.billing_customers
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Tokens de un solo uso.
create policy restrict_mfa_nonces
    on public.nonces
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());