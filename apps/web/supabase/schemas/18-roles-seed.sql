/*
 * -------------------------------------------------------
 * Sección: Datos iniciales de roles
 * Crea los dos roles de equipo por defecto y sus permisos. Forma parte del
 * esquema (y no de seed.sql) porque la aplicación necesita que existan en
 * cualquier entorno, incluido producción. Los `on conflict` hacen que el
 * fichero sea idempotente.
 * -------------------------------------------------------
 */

-- Roles por defecto: `owner` (jerarquía 1, la más alta) y `member` (2).
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
           2)
on conflict (name)
do update set hierarchy_level = excluded.hierarchy_level;

-- Permisos por defecto: el propietario tiene todos; el miembro puede editar
-- los ajustes del equipo e invitar.
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
           'member',
           'settings.manage'),
       (
           'member',
           'invites.manage')
on conflict (role, permission)
do nothing;
