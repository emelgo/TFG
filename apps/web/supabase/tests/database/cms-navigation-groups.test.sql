-- Áreas de negocio de la navegación del CMS (F3c, ADR-020).
--
-- Comprueba la migración `20261002140000_cms_navigation_groups.sql`:
--   1. cada tabla de PymeKit tiene su área en `ui_config.navigation_group` y
--      su nombre ya no lleva el prefijo del área;
--   2. volver a sincronizar las tablas con el catálogo NO borra el área ni
--      un nombre personalizado (la fusión `EXCLUDED.ui_config ||
--      table_metadata.ui_config` conserva lo guardado).
--
-- No se cambian permisos: el área se escribe por la misma columna
-- (`ui_config`) y la misma política RLS que la distribución de la ficha.
-- Se ejecuta como propietario y el ROLLBACK final deshace los cambios.
--
-- [TFG] RNF-08 · ADR-020.

begin;

select plan(7);

select is(
    (select count(*)::int from cms.table_metadata
      where ui_config ->> 'navigation_group' is not null),
    19,
    'Las 19 tablas de PymeKit tienen un área asignada'
);

select results_eq(
    $$ select ui_config ->> 'navigation_group', count(*)::int
         from cms.table_metadata
        where ui_config ->> 'navigation_group' is not null
        group by 1 order by 1 $$,
    $$ values ('Blog', 4), ('Cuentas', 7), ('Facturación', 5), ('Sistema', 3) $$,
    'Las áreas por defecto son Blog, Cuentas, Facturación y Sistema'
);

select is(
    (select count(*)::int from cms.table_metadata where display_name like '%: %'),
    0,
    'Ningún nombre visible conserva el prefijo del área'
);

select is(
    (select display_name from cms.table_metadata
      where schema_name = 'auth' and table_name = 'users'),
    'Usuarios (Auth)',
    'auth.users está registrada con su nombre en español'
);

-- Personalización hecha desde Ajustes → Recursos
update cms.table_metadata
set display_name = 'Artículos',
    ui_config = ui_config || '{"navigation_group": "Contenidos"}'::jsonb
where schema_name = 'public' and table_name = 'blog_posts';

select cms.sync_managed_tables('public', 'blog_posts');

select is(
    (select ui_config ->> 'navigation_group' from cms.table_metadata
      where schema_name = 'public' and table_name = 'blog_posts'),
    'Contenidos',
    'La sincronización conserva el área guardada'
);

select is(
    (select display_name from cms.table_metadata
      where schema_name = 'public' and table_name = 'blog_posts'),
    'Artículos',
    'La sincronización conserva el nombre personalizado'
);

select ok(
    (select ui_config ? 'primary_keys' from cms.table_metadata
      where schema_name = 'public' and table_name = 'blog_posts'),
    'El resto de ui_config sigue presente tras sincronizar'
);

select * from finish();

rollback;
