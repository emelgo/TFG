-- B-60 · Políticas RLS con funciones sin argumentos evaluadas una vez por fila.
--
-- Las políticas restrictivas de MFA y las de lectura del super-admin llamaban
-- directamente a `is_mfa_compliant()` e `is_super_admin()`. Como no dependen
-- de la fila, PostgreSQL puede evaluarlas una sola vez por consulta (InitPlan)
-- si van envueltas en `(select …)`; sin el envoltorio las evaluaba por cada
-- fila. Con 10.000 cuentas, la consulta de la lista de cuentas de la consola
-- tardaba unos 900 ms y pasa a unos 7 ms. El resultado de cada política es el
-- mismo: solo cambia cuántas veces se calcula.
--
-- Excepción: `cms.saved_views` y `cms.saved_view_roles` se dejan como están.
-- Sus políticas se consultan mutuamente (una vista compartida mira sus roles
-- y compartirla mira la vista), y PostgreSQL solo comprueba la recursión de
-- RLS cuando la política anidada contiene una subconsulta: con el
-- `(select …)`, insertar en `saved_view_roles` fallaba con «infinite
-- recursion detected in policy» (lo detectaron cms-saved-views y
-- cms-rbac-f27b). Son tablas pequeñas, así que la evaluación por fila no
-- se nota.
--
-- `alter policy` conserva el modo (permisivo o restrictivo), los roles y la
-- orden de cada política; solo sustituye su expresión `using`. Los esquemas
-- declarativos (13-mfa, 14-super-admin, 15-active-account y 49-cms-mfa-rls)
-- llevan ya la forma nueva.

alter policy restrict_mfa_account_permissions on cms.account_permissions using ((select cms.is_mfa_compliant()));
alter policy restrict_mfa_account_roles on cms.account_roles using ((select cms.is_mfa_compliant()));
alter policy restrict_mfa_accounts on cms.accounts using ((select cms.is_mfa_compliant()));
alter policy restrict_mfa_audit_logs on cms.audit_logs using ((select cms.is_mfa_compliant()));
alter policy restrict_mfa_configuration on cms.configuration using ((select cms.is_mfa_compliant()));
alter policy restrict_mfa_permission_groups on cms.permission_groups using ((select cms.is_mfa_compliant()));
alter policy restrict_mfa_permission_groups_permissions on cms.permission_group_permissions using ((select cms.is_mfa_compliant()));
alter policy restrict_mfa_permissions on cms.permissions using ((select cms.is_mfa_compliant()));
alter policy restrict_mfa_role_permission_groups on cms.role_permission_groups using ((select cms.is_mfa_compliant()));
alter policy restrict_mfa_role_permissions on cms.role_permissions using ((select cms.is_mfa_compliant()));
alter policy restrict_mfa_roles on cms.roles using ((select cms.is_mfa_compliant()));
alter policy restrict_mfa_table_metadata on cms.table_metadata using ((select cms.is_mfa_compliant()));
alter policy restrict_mfa_accounts on public.accounts using ((select public.is_mfa_compliant()));
alter policy restrict_mfa_accounts_memberships on public.accounts_memberships using ((select public.is_mfa_compliant()));
alter policy restrict_mfa_billing_customers on public.billing_customers using ((select public.is_mfa_compliant()));
alter policy restrict_mfa_invitations on public.invitations using ((select public.is_mfa_compliant()));
alter policy restrict_mfa_nonces on public.nonces using ((select public.is_mfa_compliant()));
alter policy restrict_mfa_notifications on public.notifications using ((select public.is_mfa_compliant()));
alter policy restrict_mfa_order_items on public.order_items using ((select public.is_mfa_compliant()));
alter policy restrict_mfa_orders on public.orders using ((select public.is_mfa_compliant()));
alter policy restrict_mfa_role_permissions on public.role_permissions using ((select public.is_mfa_compliant()));
alter policy restrict_mfa_subscription_items on public.subscription_items using ((select public.is_mfa_compliant()));
alter policy restrict_mfa_subscriptions on public.subscriptions using ((select public.is_mfa_compliant()));
alter policy restrict_mfa_user_active_account on public.user_active_account using ((select public.is_mfa_compliant()));
alter policy super_admins_access_accounts on public.accounts using ((select public.is_super_admin()));
alter policy super_admins_access_accounts_memberships on public.accounts_memberships using ((select public.is_super_admin()));
alter policy super_admins_access_billing_customers on public.billing_customers using ((select public.is_super_admin()));
alter policy super_admins_access_invitations on public.invitations using ((select public.is_super_admin()));
alter policy super_admins_access_notifications on public.notifications using ((select public.is_super_admin()));
alter policy super_admins_access_order_items on public.order_items using ((select public.is_super_admin()));
alter policy super_admins_access_orders on public.orders using ((select public.is_super_admin()));
alter policy super_admins_access_role_permissions on public.role_permissions using ((select public.is_super_admin()));
alter policy super_admins_access_subscription_items on public.subscription_items using ((select public.is_super_admin()));
alter policy super_admins_access_subscriptions on public.subscriptions using ((select public.is_super_admin()));
