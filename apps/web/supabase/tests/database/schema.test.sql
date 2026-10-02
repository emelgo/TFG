BEGIN;

select no_plan();

select has_table('public', 'config', 'PymeKit config table should exist');
select has_table('public', 'accounts', 'PymeKit accounts table should exist');
select has_table('public', 'accounts_memberships', 'PymeKit account_users table should exist');
select has_table('public', 'invitations', 'PymeKit invitations table should exist');
select has_table('public', 'billing_customers', 'PymeKit billing_customers table should exist');
select has_table('public', 'subscriptions', 'PymeKit subscriptions table should exist');
select has_table('public', 'subscription_items', 'PymeKit subscription_items table should exist');
select has_table('public', 'orders', 'PymeKit orders table should exist');
select has_table('public', 'order_items', 'PymeKit order_items table should exist');
select has_table('public', 'roles', 'PymeKit roles table should exist');
select has_table('public', 'role_permissions', 'PymeKit roles_permissions table should exist');

select tests.rls_enabled('public', 'config');
select tests.rls_enabled('public', 'accounts');
select tests.rls_enabled('public', 'accounts_memberships');
select tests.rls_enabled('public', 'invitations');
select tests.rls_enabled('public', 'billing_customers');
select tests.rls_enabled('public', 'subscriptions');
select tests.rls_enabled('public', 'subscription_items');
select tests.rls_enabled('public', 'orders');
select tests.rls_enabled('public', 'order_items');
select tests.rls_enabled('public', 'roles');
select tests.rls_enabled('public', 'role_permissions');

-- F2.6b (ADR-017): anon recibe `usage` sobre public para leer el blog
-- publicado; nada más (ni `create`). El resto de privilegios de anon en el
-- esquema se comprueba en blog.test.sql.
SELECT schema_privs_are('public', 'anon', Array ['USAGE'], 'Anon solo tiene usage sobre el esquema public');

-- set the role to anonymous for verifying access tests
set role anon;
select throws_ok('select public.get_config()');
select throws_ok('select public.is_set(''enable_team_accounts'')');

-- set the role to the service_role for testing access
set role service_role;
select ok(public.get_config() is not null),
       'PymeKit get_config should be accessible to the service role';

-- set the role to authenticated for tests
set role authenticated;
select ok(public.get_config() is not null), 'PymeKit get_config should be accessible to authenticated users';
select ok(public.is_set('enable_team_accounts')),
       'PymeKit is_set should be accessible to authenticated users';
select isnt_empty('select * from public.config', 'authenticated users should have access to PymeKit config');

SELECT *
FROM finish();

ROLLBACK;