/*
 * -------------------------------------------------------
 * Section: Roles Seed
 * We create the roles and role permissions seed data
 * -------------------------------------------------------
 */

-- Roles por defecto: 'owner' (1), 'manager' (2, «Encargado», F5 · ADR-023)
-- y 'member' (3). Cuanto menor es el nivel, más rango tiene el rol
insert into public.roles(
    name,
    hierarchy_level)
values (
           'owner',
           1)
on conflict (name)
do update set hierarchy_level = excluded.hierarchy_level;

insert into public.roles(
    name,
    hierarchy_level)
values (
           'member',
           3)
on conflict (name)
do update set hierarchy_level = excluded.hierarchy_level;

insert into public.roles(
    name,
    hierarchy_level)
values (
           'manager',
           2)
on conflict (name)
do update set hierarchy_level = excluded.hierarchy_level;

-- We seed the role_permissions table with the default roles and permissions
insert into public.role_permissions(
    role,
    permission)
values (
           'owner',
           'roles.manage'),
       (
           'owner',
           'billing.manage'),
       (
           'owner',
           'settings.manage'),
       (
           'owner',
           'members.manage'),
       (
           'owner',
           'invites.manage'),
       (
           'manager',
           'roles.manage'),
       (
           'manager',
           'settings.manage'),
       (
           'manager',
           'members.manage'),
       (
           'manager',
           'invites.manage'),
       (
           'member',
           'settings.manage'),
       (
           'member',
           'invites.manage')
on conflict (role, permission)
do nothing;
