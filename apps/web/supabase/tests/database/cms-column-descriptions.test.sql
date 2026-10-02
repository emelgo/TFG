-- Descripciones en español de las columnas de PymeKit en el CMS (ayuda «?»
-- de los formularios del explorador de datos, RNF-08).
--
-- Comprueba la migración `20261002160000_cms_column_descriptions.sql`:
--   1. las columnas de las tablas de PymeKit tienen descripción, tanto las
--      del diccionario común (`created_at`) como los casos por tabla
--      (`blog_posts.status` no dice lo mismo que `orders.status`);
--   2. volver a aplicar el rellenado NO pisa una descripción personalizada
--      desde Ajustes → Recursos (solo se rellenan las vacías), y la
--      sincronización con el catálogo tampoco la borra.
--
-- Se ejecuta como propietario y el ROLLBACK final deshace los cambios.
--
-- [TFG] RNF-08 · ADR-020.

begin;

select plan(6);

select is(
    (select columns_config -> 'excerpt' ->> 'description'
       from cms.table_metadata
      where schema_name = 'public' and table_name = 'blog_posts'),
    'Resumen breve (una o dos frases) que aparece en el listado del blog y al compartir la entrada.',
    'blog_posts.excerpt tiene su descripción'
);

select ok(
    (select columns_config -> 'created_at' ->> 'description' like 'Fecha y hora en que se creó%'
       from cms.table_metadata
      where schema_name = 'public' and table_name = 'orders'),
    'El diccionario común describe created_at en cualquier tabla'
);

select isnt(
    (select columns_config -> 'status' ->> 'description'
       from cms.table_metadata
      where schema_name = 'public' and table_name = 'blog_posts'),
    (select columns_config -> 'status' ->> 'description'
       from cms.table_metadata
      where schema_name = 'public' and table_name = 'orders'),
    'Los casos por tabla tienen prioridad sobre el diccionario común'
);

select is(
    (select count(*)::int
       from cms.table_metadata as meta,
            jsonb_each(meta.columns_config) as col (key, value)
      where meta.schema_name = 'public'
        and meta.table_name like 'blog\_%'
        and nullif(trim(col.value ->> 'description'), '') is null),
    0,
    'Todas las columnas del blog tienen descripción'
);

-- Personalización hecha desde Ajustes → Recursos
update cms.table_metadata
set columns_config = jsonb_set(
    columns_config, '{excerpt,description}', '"Mi descripción"'::jsonb
)
where schema_name = 'public' and table_name = 'blog_posts';

-- Se vuelve a aplicar la misma sentencia de la migración (con un
-- diccionario de una fila) para simular una segunda ejecución.
create temporary table cms_column_descriptions (
    table_name text,
    column_name text not null,
    description text not null
) on commit drop;

insert into cms_column_descriptions values
    ('blog_posts', 'excerpt', 'Texto de la migración');

update cms.table_metadata as meta
set columns_config = (
    select jsonb_object_agg(
        col.key,
        case
            when nullif(trim(col.value ->> 'description'), '') is null
                and coalesce(by_table.description, common.description) is not null
            then col.value || jsonb_build_object(
                'description', coalesce(by_table.description, common.description)
            )
            else col.value
        end
    )
    from jsonb_each(meta.columns_config) as col (key, value)
    left join cms_column_descriptions as by_table
        on by_table.table_name = meta.table_name
       and by_table.column_name = col.key
    left join cms_column_descriptions as common
        on common.table_name is null
       and common.column_name = col.key
)
where meta.schema_name = 'public' and meta.table_name = 'blog_posts';

select is(
    (select columns_config -> 'excerpt' ->> 'description'
       from cms.table_metadata
      where schema_name = 'public' and table_name = 'blog_posts'),
    'Mi descripción',
    'Volver a aplicar el rellenado no pisa la descripción personalizada'
);

select cms.sync_managed_tables('public', 'blog_posts');

select is(
    (select columns_config -> 'excerpt' ->> 'description'
       from cms.table_metadata
      where schema_name = 'public' and table_name = 'blog_posts'),
    'Mi descripción',
    'La sincronización conserva la descripción personalizada'
);

select * from finish();

rollback;
