/*
 * F2.6b · Metadatos del CMS para las tablas de PymeKit (ADR-017).
 *
 * Migración de DATOS (no de esquema), escrita a mano: el explorador del CMS
 * solo muestra las tablas descritas en `cms.table_metadata`, y sus listados,
 * fichas y selectores de claves foráneas muestran el id de la fila
 * relacionada salvo que la tabla destino tenga un «formato de visualización»
 * (`display_format`, por ejemplo `{name} ({email || slug})`). Hasta ahora
 * todo esto solo lo hacía el *seed*, así que en producción el CMS arrancaba
 * sin tablas registradas y mostraba uuid en todas las relaciones.
 *
 * Es idempotente: `sync_managed_tables` conserva los ajustes existentes y los
 * `update` fijan siempre el mismo valor, así que puede volver a aplicarse (y
 * el *seed* puede volver a sincronizar `public`) sin duplicar nada.
 *
 * Contenido:
 *  1. Registro (sincronización) de todas las tablas de `public`, incluidas
 *     las del blog.
 *  2. Formatos de visualización: cuentas → nombre y email (o slug), roles →
 *     nombre, entradas del blog → título, categorías y etiquetas → nombre…
 *  3. Relación virtual `accounts_memberships.user_id` → `public.accounts(id)`:
 *     la clave foránea real apunta a `auth.users`, un esquema protegido que
 *     el CMS no lee (bitácora B-07), así que la ficha y el listado de
 *     membresías mostraban un uuid. En PymeKit la cuenta personal comparte id
 *     con su usuario (`accounts.id = auth.users.id`), de modo que la relación
 *     con `accounts` identifica al mismo miembro y muestra su nombre y email.
 *  4. Blog: nombres en español para quien redacta, el cuerpo como Markdown
 *     (área de texto), `published_at` editable (para programar) y las
 *     columnas de trazabilidad de solo lectura.
 *
 * [TFG] RF-09 · ADR-017: visualización legible de las relaciones en el CMS.
 */

-- 1. Registro de las tablas de `public` en el explorador del CMS
select cms.sync_managed_tables('public');

-- 2. Formatos de visualización (etiqueta de cada fila en las relaciones)
update cms.table_metadata
set display_format = '{name} ({email || slug})'
where schema_name = 'public'
  and table_name = 'accounts';

update cms.table_metadata
set display_format = '{name}'
where schema_name = 'public'
  and table_name in ('roles', 'blog_categories', 'blog_tags');

update cms.table_metadata
set display_format = '{title}'
where schema_name = 'public'
  and table_name = 'blog_posts';

update cms.table_metadata
set display_format = '{email || customer_id}'
where schema_name = 'public'
  and table_name = 'billing_customers';

update cms.table_metadata
set display_format = '{email} ({role})'
where schema_name = 'public'
  and table_name = 'invitations';

/*
 * 3. Relación virtual de las membresías con la cuenta personal del miembro.
 *
 * Se quita la relación `user_id` → `auth.users` y se añade la virtual
 * (`is_virtual = true`). `sync_managed_tables` respeta las virtuales: no
 * vuelve a añadir la clave foránea real sobre esa columna y conserva la
 * virtual en cada sincronización.
 *
 * Solo cambia CÓMO se muestra el valor: leer la cuenta relacionada sigue
 * exigiendo el permiso `select` sobre `public.accounts` en el RBAC del CMS
 * (quien no lo tenga ve el id sin enlace), y la integridad la sigue
 * garantizando la clave foránea real de la tabla.
 */
update cms.table_metadata
set relations_config = (
    select coalesce(jsonb_agg(rel.value), '[]'::jsonb)
    from jsonb_array_elements(relations_config) as rel(value)
    where not (
        rel.value ->> 'source_column' = 'user_id'
        and coalesce(rel.value ->> 'relation_type', 'many_to_one') = 'many_to_one'
    )
) || jsonb_build_array(
    jsonb_build_object(
        'source_column', 'user_id',
        'target_schema', 'public',
        'target_table', 'accounts',
        'target_column', 'id',
        'relation_type', 'many_to_one',
        'display_fields', '[]'::jsonb,
        'is_virtual', true
    )
)
where schema_name = 'public'
  and table_name = 'accounts_memberships';

-- 4. Blog: nombres visibles para el equipo de contenidos
update cms.table_metadata
set display_name = case table_name
        when 'blog_posts' then 'Blog: entradas'
        when 'blog_categories' then 'Blog: categorías'
        when 'blog_tags' then 'Blog: etiquetas'
        when 'blog_post_tags' then 'Blog: etiquetas de entradas'
    end,
    description = case table_name
        when 'blog_posts' then 'Entradas del blog de la web pública'
        when 'blog_categories' then 'Categorías de las entradas del blog'
        when 'blog_tags' then 'Etiquetas de las entradas del blog'
        when 'blog_post_tags' then 'Relación entre entradas y etiquetas'
    end
where schema_name = 'public'
  and table_name in ('blog_posts', 'blog_categories', 'blog_tags', 'blog_post_tags');

/*
 * Columnas de `blog_posts`:
 *  - `content`: Markdown, se edita en un área de texto y no se muestra en el
 *    listado (sería ilegible);
 *  - `published_at`: editable para programar una publicación (la
 *    sincronización marca como no editables las columnas `*_at`);
 *  - `created_by`/`updated_by`: las escribe el *trigger* de trazabilidad, así
 *    que no se ofrecen en el formulario.
 */
update cms.table_metadata
set columns_config = columns_config
    || jsonb_build_object(
        'title', columns_config -> 'title' || '{"display_name": "Título"}',
        'slug', columns_config -> 'slug' || '{"display_name": "Slug"}',
        'excerpt', columns_config -> 'excerpt' || '{"display_name": "Resumen"}',
        'content', columns_config -> 'content' || jsonb_build_object(
            'display_name', 'Contenido (Markdown)',
            'is_visible_in_table', false,
            'ui_config', coalesce(columns_config -> 'content' -> 'ui_config', '{}'::jsonb)
                || '{"ui_data_type": "markdown"}'
        ),
        'cover_image_url', columns_config -> 'cover_image_url' || '{"display_name": "Imagen de portada (https)"}',
        'status', columns_config -> 'status' || '{"display_name": "Estado"}',
        'published_at', columns_config -> 'published_at'
            || '{"display_name": "Fecha de publicación", "is_editable": true}',
        'author_id', columns_config -> 'author_id' || '{"display_name": "Autor"}',
        'category_id', columns_config -> 'category_id' || '{"display_name": "Categoría"}',
        'seo_title', columns_config -> 'seo_title'
            || '{"display_name": "Título SEO", "is_visible_in_table": false}',
        'seo_description', columns_config -> 'seo_description'
            || '{"display_name": "Descripción SEO", "is_visible_in_table": false}',
        'created_by', columns_config -> 'created_by'
            || '{"is_editable": false, "is_visible_in_table": false}',
        'updated_by', columns_config -> 'updated_by'
            || '{"is_editable": false, "is_visible_in_table": false}'
    )
where schema_name = 'public'
  and table_name = 'blog_posts';

update cms.table_metadata
set columns_config = columns_config
    || jsonb_build_object(
        'name', columns_config -> 'name' || '{"display_name": "Nombre"}',
        'slug', columns_config -> 'slug' || '{"display_name": "Slug"}'
    )
where schema_name = 'public'
  and table_name in ('blog_categories', 'blog_tags');

-- Tabla intermedia: sus dos columnas forman la clave primaria, que la
-- sincronización marca como no editable. «Vincular» en la ficha de una
-- entrada inserta una fila con las dos, así que deben ser editables (las
-- funciones del CMS solo escriben columnas marcadas como editables).
update cms.table_metadata
set columns_config = columns_config
    || jsonb_build_object(
        'post_id', columns_config -> 'post_id'
            || '{"display_name": "Entrada", "is_editable": true}',
        'tag_id', columns_config -> 'tag_id'
            || '{"display_name": "Etiqueta", "is_editable": true}'
    )
where schema_name = 'public'
  and table_name = 'blog_post_tags';
