/*
 * Pruebas del rol intermedio «Encargado» (`manager`) de los equipos
 * (F5 · ADR-023).
 *
 * Comprueban la jerarquía (owner 1 < manager 2 < member 3), el conjunto
 * exacto de permisos de cada rol por defecto y que la jerarquía limita lo
 * que un encargado puede hacer: gestiona a los miembros, pero no a otros
 * encargados ni a los propietarios, no gestiona la facturación y no es
 * propietario del equipo (no puede borrarlo ni transferirlo).
 *
 * Usa el equipo del *seed* (`pymekit`): propietario principal `test@`,
 * propietario `owner@`, miembro `member@` y `custom@` con un rol
 * personalizado de nivel 4.
 */
begin;

select no_plan();

-- 1 · Jerarquía y permisos por defecto

select results_eq(
    $$ select name::text, hierarchy_level from public.roles
       where name in ('owner', 'manager', 'member') order by hierarchy_level $$,
    $$ values ('owner', 1), ('manager', 2), ('member', 3) $$,
    'Jerarquía por defecto: owner (1), manager (2), member (3)'
);

select results_eq(
    $$ select permission::text from public.role_permissions
       where role = 'manager' order by permission::text $$,
    $$ values ('invites.manage'), ('members.manage'), ('roles.manage'), ('settings.manage') $$,
    'El encargado gestiona invitaciones, miembros, roles y ajustes'
);

select results_eq(
    $$ select permission::text from public.role_permissions
       where role = 'owner' order by permission::text $$,
    $$ values ('billing.manage'), ('invites.manage'), ('members.manage'), ('roles.manage'), ('settings.manage') $$,
    'El propietario conserva todos los permisos'
);

select results_eq(
    $$ select permission::text from public.role_permissions
       where role = 'member' order by permission::text $$,
    $$ values ('invites.manage'), ('settings.manage') $$,
    'Los permisos del miembro no cambian'
);

-- 2 · Escenario: dos encargados en el equipo del seed

select pymekit.set_identifier('owner', 'owner@pymekit.test');
select pymekit.set_identifier('member', 'member@pymekit.test');
select pymekit.set_identifier('custom', 'custom@pymekit.test');

select tests.create_supabase_user('manager', 'manager@test.com');
select tests.create_supabase_user('manager2', 'manager2@test.com');

insert into public.accounts_memberships (account_id, user_id, account_role)
values
    (pymekit.get_account_id_by_slug('pymekit'), tests.get_supabase_uid('manager'), 'manager'),
    (pymekit.get_account_id_by_slug('pymekit'), tests.get_supabase_uid('manager2'), 'manager');

select pymekit.authenticate_as('manager');

select ok(
    public.has_permission(auth.uid(), pymekit.get_account_id_by_slug('pymekit'), 'members.manage'),
    'El encargado tiene members.manage'
);

select ok(
    not public.has_permission(auth.uid(), pymekit.get_account_id_by_slug('pymekit'), 'billing.manage'),
    'El encargado NO tiene billing.manage'
);

select ok(
    not public.is_account_owner(pymekit.get_account_id_by_slug('pymekit')),
    'El encargado no es propietario del equipo (no puede borrarlo ni transferirlo)'
);

-- Puede asignar su propio rango o uno inferior, nunca uno superior
select ok(
    public.has_more_elevated_role(auth.uid(), pymekit.get_account_id_by_slug('pymekit'), 'member'),
    'El encargado está por encima de member'
);

select ok(
    public.has_same_role_hierarchy_level(auth.uid(), pymekit.get_account_id_by_slug('pymekit'), 'manager'),
    'El encargado puede asignar como mucho su propio rango'
);

select ok(
    not public.has_more_elevated_role(auth.uid(), pymekit.get_account_id_by_slug('pymekit'), 'owner')
    and not public.has_same_role_hierarchy_level(auth.uid(), pymekit.get_account_id_by_slug('pymekit'), 'owner'),
    'El encargado no puede asignar el rol de propietario'
);

-- No puede actuar sobre otro encargado ni sobre un propietario
select throws_ok(
    $$ select public.can_action_account_member(pymekit.get_account_id_by_slug('pymekit'),
                                               tests.get_supabase_uid('manager2')) $$,
    'You do not have permission to action a member from this account',
    'El encargado no puede gestionar a otro encargado'
);

select throws_ok(
    $$ select public.can_action_account_member(pymekit.get_account_id_by_slug('pymekit'),
                                               tests.get_supabase_uid('owner')) $$,
    'You do not have permission to action a member from this account',
    'El encargado no puede gestionar a un propietario'
);

-- Sí puede retirar del equipo a un miembro y a un rol personalizado inferior.
-- Los ids van como literales (los del seed) para que el borrado use la clave
-- primaria: la política de DELETE llama a `can_action_account_member`, que
-- LANZA un error (no devuelve falso) si se evalúa sobre la fila del
-- propietario principal, y con una función no inmutable en el WHERE el
-- planificador recorrería toda la tabla aplicando antes la política.
select lives_ok(
    $$ delete from public.accounts_memberships
       where account_id = pymekit.get_account_id_by_slug('pymekit')
         and user_id = '6b83d656-e4ab-48e3-a062-c0c54a427368' $$,
    'El encargado puede retirar a un miembro'
);

select lives_ok(
    $$ delete from public.accounts_memberships
       where account_id = pymekit.get_account_id_by_slug('pymekit')
         and user_id = 'b73eb03e-fb7a-424d-84ff-18e2791ce0b4' $$,
    'El encargado puede retirar a un rol personalizado de nivel inferior'
);

set local role postgres;

select is(
    (select count(*)::int from public.accounts_memberships
     where account_id = pymekit.get_account_id_by_slug('pymekit')
       and user_id in (tests.get_supabase_uid('member'), tests.get_supabase_uid('custom'))),
    0,
    'Las dos membresías se han borrado de verdad'
);

-- 3 · Un miembro (nivel 3) no puede actuar sobre un encargado

insert into public.accounts_memberships (account_id, user_id, account_role)
values (pymekit.get_account_id_by_slug('pymekit'), tests.get_supabase_uid('member'), 'member');

select pymekit.authenticate_as('member');

select ok(
    not public.has_more_elevated_role(auth.uid(), pymekit.get_account_id_by_slug('pymekit'), 'manager'),
    'Un miembro no está por encima de un encargado'
);

select throws_ok(
    $$ select public.can_action_account_member(pymekit.get_account_id_by_slug('pymekit'),
                                               tests.get_supabase_uid('manager')) $$,
    'You do not have permission to action a member from this account',
    'Un miembro no puede gestionar a un encargado'
);

select * from finish();

rollback;
