/*
 * F5 · Rol intermedio «Encargado» (`manager`) para los equipos (ADR-024)
 *
 * Una pyme que usa los equipos (por ejemplo, una cuenta por tienda) necesita
 * a alguien que gestione al personal sin tocar la facturación ni poder borrar
 * el equipo. Hasta ahora solo había dos rangos: `owner` (1) y `member` (2).
 *
 * La migración es de datos e idempotente: se puede aplicar sobre una base de
 * datos de producción que ya tenga equipos y membresías, porque no borra ni
 * renombra nada.
 *
 *   1. `member` baja al nivel 3 para dejar libre el 2. `hierarchy_level` es
 *      `unique`, así que hay que moverlo ANTES de insertar el rol nuevo. Las
 *      membresías apuntan al nombre del rol, no al nivel, así que no cambian.
 *      Un rol personalizado que ya ocupase el nivel 3 haría fallar la
 *      migración: es preferible a reordenar en silencio los rangos de otro.
 *   2. Se crea `manager` en el nivel 2.
 *   3. Permisos de `manager`: miembros, roles, invitaciones y ajustes del
 *      equipo. NO recibe `billing.manage`. Borrar el equipo o transferir su
 *      propiedad sigue reservado al propietario principal, que se comprueba
 *      aparte (`primary_owner_user_id`), no con un permiso.
 *
 * La jerarquía hace el resto: `can_action_account_member` y
 * `has_more_elevated_role` solo dejan a un encargado actuar sobre rangos
 * inferiores (miembros) y asignar como mucho su propio rango.
 */

update public.roles
set hierarchy_level = 3
where name = 'member'
  and hierarchy_level = 2;

insert into public.roles (name, hierarchy_level)
values ('manager', 2)
on conflict (name) do nothing;

insert into public.role_permissions (role, permission)
values
  ('manager', 'roles.manage'),
  ('manager', 'settings.manage'),
  ('manager', 'members.manage'),
  ('manager', 'invites.manage')
on conflict (role, permission) do nothing;
