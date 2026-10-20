/*
 * Pruebas de la plantilla inicial de roles del CMS (F5 · ADR-026,
 * migración `20261020120100_cms_role_templates.sql`).
 *
 * Comprueban que existen los roles «Soporte» y «Gestor de contenidos» con su
 * rango y que sus permisos efectivos (directos y a través de grupos) son
 * EXACTAMENTE los esperados: Soporte solo lee; el gestor de contenidos tiene
 * todas las acciones sobre el blog y los archivos y nada sobre cuentas,
 * usuarios o facturación. Ninguno es un objeto de sistema, así que la raíz
 * del CMS puede editarlos.
 */
begin;

select no_plan();

-- Permisos efectivos de un rol como texto legible, uniendo los directos
-- (`role_permissions`) y los que llegan por grupo
-- (`role_permission_groups` → `permission_group_permissions`).
create temporary view role_template_permissions as
select r.name as role_name,
       coalesce(p.system_resource::text, p.scope::text || ':' || coalesce(p.schema_name || '.' || p.table_name,
                                                                         p.metadata ->> 'bucket_name'))
           || ':' || p.action::text as permission
from cms.roles r
join cms.role_permissions rp on rp.role_id = r.id
join cms.permissions p on p.id = rp.permission_id
union
select r.name,
       coalesce(p.system_resource::text, p.scope::text || ':' || coalesce(p.schema_name || '.' || p.table_name,
                                                                         p.metadata ->> 'bucket_name'))
           || ':' || p.action::text
from cms.roles r
join cms.role_permission_groups rpg on rpg.role_id = r.id
join cms.permission_group_permissions pgp on pgp.group_id = rpg.group_id
join cms.permissions p on p.id = pgp.permission_id;

select results_eq(
    $$ select name::text, rank from cms.roles
       where name in ('Soporte', 'Gestor de contenidos') order by rank $$,
    $$ values ('Soporte', 30), ('Gestor de contenidos', 35) $$,
    'Existen los dos roles de la plantilla con su rango'
);

select is(
    (select count(*)::int from cms.roles
     where name in ('Soporte', 'Gestor de contenidos') and metadata ? 'system_role'),
    0,
    'Los roles de la plantilla no son objetos de sistema (se pueden editar)'
);

select results_eq(
    $$ select permission from role_template_permissions
       where role_name = 'Soporte' order by permission collate "C" $$,
    $$ values ('auth_user:select'), ('log:select'), ('table:public.accounts:select'),
              ('table:public.accounts_memberships:select') $$,
    'Soporte: lectura de cuentas, miembros, usuarios y auditoría'
);

select is(
    (select count(*)::int from role_template_permissions
     where role_name = 'Soporte' and permission not like '%:select'),
    0,
    'Soporte no tiene ninguna acción distinta de leer'
);

select results_eq(
    $$ select permission from role_template_permissions
       where role_name = 'Gestor de contenidos' order by permission collate "C" $$,
    $$ values ('storage:*:*'), ('table:public.blog_categories:*'), ('table:public.blog_post_tags:*'),
              ('table:public.blog_posts:*'), ('table:public.blog_tags:*') $$,
    'Gestor de contenidos: CRUD del blog y de los archivos, nada más'
);

select is(
    (select count(*)::int from cms.role_permissions rp
     join cms.roles r on r.id = rp.role_id
     where r.name = 'Gestor de contenidos'),
    0,
    'Los permisos del gestor de contenidos llegan solo por su grupo'
);

select results_eq(
    $$ select g.name::text from cms.role_permission_groups rpg
       join cms.roles r on r.id = rpg.role_id
       join cms.permission_groups g on g.id = rpg.group_id
       where r.name = 'Gestor de contenidos' $$,
    $$ values ('Contenidos') $$,
    'El gestor de contenidos tiene el grupo «Contenidos»'
);

-- La plantilla no da acceso a nadie por sí misma: en local, el único
-- asignado a «Soporte» es el usuario de pruebas del seed
select is(
    (select count(*)::int from cms.account_roles ar
     join cms.roles r on r.id = ar.role_id
     where r.name = 'Gestor de contenidos'),
    0,
    'Nadie tiene asignado el rol de gestor de contenidos de partida'
);

select * from finish();

rollback;
