-- Pruebas del blog en la base de datos (F2.6b, ADR-017).
--
-- Comprueba el modelo de seguridad de `schemas/19-blog.sql`:
--
--  1. Estructura: las cuatro tablas existen y tienen RLS activo.
--  2. Lectura pública: `anon` y un usuario autenticado cualquiera solo ven
--     las entradas publicadas con fecha alcanzada; los borradores, lo
--     archivado y lo programado para el futuro no existen para ellos, ni
--     tampoco sus etiquetas.
--  3. Columnas privadas: `anon` no puede leer `created_by`, `updated_by` ni
--     `author_id` (identificadores de usuario).
--  4. Sin escritura: ni `anon` ni `authenticated` pueden insertar, modificar
--     ni borrar en ninguna tabla del blog, y ningún rol de la API tiene
--     TRUNCATE, TRIGGER ni REFERENCES.
--  5. Apertura mínima de `public` a `anon`: aparte de las tablas del blog,
--     `anon` no puede leer ninguna tabla, usar ninguna secuencia ni ejecutar
--     ninguna función del esquema.
--  6. Escritura desde el CMS: Root (el super-admin) crea una entrada y la
--     etiqueta con `cms.insert_record`; el personal de soporte, sin permiso
--     sobre el blog, no puede. Al publicar sin fecha se fija `published_at`.
--
-- [TFG] RF-01 · RF-09 · RNF-02 · ADR-017.

begin;

select no_plan();

-- ---------------------------------------------------------------------------
-- 1. Estructura
-- ---------------------------------------------------------------------------

select has_table('public', 'blog_posts', 'Existe la tabla de entradas');
select has_table('public', 'blog_categories', 'Existe la tabla de categorías');
select has_table('public', 'blog_tags', 'Existe la tabla de etiquetas');
select has_table('public', 'blog_post_tags', 'Existe la tabla intermedia entradas ↔ etiquetas');

select tests.rls_enabled('public', 'blog_posts');
select tests.rls_enabled('public', 'blog_categories');
select tests.rls_enabled('public', 'blog_tags');
select tests.rls_enabled('public', 'blog_post_tags');

-- ---------------------------------------------------------------------------
-- Preparación (como `postgres`, sin RLS): una entrada por cada estado, con
-- un prefijo propio para no depender del contenido del *seed*
-- ---------------------------------------------------------------------------

insert into public.blog_categories (name, slug) values ('Pruebas', 'bt-pruebas');

insert into public.blog_tags (name, slug) values ('Visible', 'bt-visible'), ('Oculta', 'bt-oculta');

insert into public.blog_posts (slug, title, content, status, published_at, category_id)
values
    ('bt-publicada', 'Publicada', 'Texto', 'published', now() - interval '1 day',
     (select id from public.blog_categories where slug = 'bt-pruebas')),
    ('bt-borrador', 'Borrador', 'Texto', 'draft', null, null),
    ('bt-archivada', 'Archivada', 'Texto', 'archived', now() - interval '2 days', null),
    ('bt-programada', 'Programada', 'Texto', 'published', now() + interval '7 days', null);

insert into public.blog_post_tags (post_id, tag_id)
values
    ((select id from public.blog_posts where slug = 'bt-publicada'),
     (select id from public.blog_tags where slug = 'bt-visible')),
    ((select id from public.blog_posts where slug = 'bt-borrador'),
     (select id from public.blog_tags where slug = 'bt-oculta'));

-- ---------------------------------------------------------------------------
-- 2. Lectura pública como `anon`
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select results_eq(
    $$ select slug::text from public.blog_posts where slug like 'bt-%' order by slug $$,
    $$ values ('bt-publicada') $$,
    'anon solo ve la entrada publicada con fecha alcanzada'
);

select is_empty(
    $$ select 1 from public.blog_posts where status <> 'published' or published_at > now() $$,
    'anon no ve borradores, archivadas ni programadas (tampoco las del seed)'
);

select isnt_empty(
    $$ select 1 from public.blog_posts where slug = 'por-que-una-pyme-necesita-un-saas' $$,
    'anon ve las entradas publicadas del seed'
);

select is_empty(
    $$ select 1 from public.blog_posts where slug = 'guia-para-migrar-a-la-nube' $$,
    'anon no ve el borrador del seed'
);

select results_eq(
    $$ select tag.slug::text
       from public.blog_post_tags as link
       join public.blog_tags as tag on tag.id = link.tag_id
       where tag.slug like 'bt-%' $$,
    $$ values ('bt-visible') $$,
    'anon solo ve las etiquetas de entradas publicadas'
);

select isnt_empty(
    $$ select 1 from public.blog_categories where slug = 'bt-pruebas' $$,
    'anon puede leer las categorías'
);

select isnt_empty(
    $$ select 1 from public.blog_tags where slug = 'bt-oculta' $$,
    'anon puede leer las etiquetas (el catálogo es público)'
);

-- 3. Columnas privadas: identificadores de usuario fuera del alcance de anon
select throws_ok(
    $$ select created_by from public.blog_posts $$,
    '42501',
    null,
    'anon no puede leer blog_posts.created_by'
);

select throws_ok(
    $$ select author_id from public.blog_posts $$,
    '42501',
    null,
    'anon no puede leer blog_posts.author_id'
);

select throws_ok(
    $$ select * from public.blog_posts $$,
    '42501',
    null,
    'select * falla para anon: la lectura es por columnas'
);

-- 4. Sin escritura para anon
select throws_ok(
    $$ insert into public.blog_posts (slug, title) values ('bt-anon', 'Anon') $$,
    '42501',
    null,
    'anon no puede crear entradas'
);

select throws_ok(
    $$ update public.blog_posts set title = 'Cambiado' where slug = 'bt-publicada' $$,
    '42501',
    null,
    'anon no puede modificar entradas'
);

select throws_ok(
    $$ delete from public.blog_posts where slug = 'bt-publicada' $$,
    '42501',
    null,
    'anon no puede borrar entradas'
);

select throws_ok(
    $$ insert into public.blog_categories (name, slug) values ('X', 'bt-x') $$,
    '42501',
    null,
    'anon no puede crear categorías'
);

select throws_ok(
    $$ insert into public.blog_tags (name, slug) values ('X', 'bt-x') $$,
    '42501',
    null,
    'anon no puede crear etiquetas'
);

select throws_ok(
    $$ delete from public.blog_post_tags $$,
    '42501',
    null,
    'anon no puede desvincular etiquetas'
);

select throws_ok(
    $$ truncate public.blog_posts cascade $$,
    '42501',
    null,
    'anon no puede vaciar la tabla de entradas (TRUNCATE ignora RLS)'
);

-- 5. `usage` sobre public no abre nada más: las tablas de la plataforma y
-- sus funciones siguen cerradas para anon
select throws_ok(
    $$ select id from public.accounts limit 1 $$,
    '42501',
    'permission denied for table accounts',
    'anon sigue sin poder leer las cuentas'
);

select throws_ok(
    $$ select * from public.user_accounts $$,
    '42501',
    null,
    'anon no puede consultar las vistas de cuentas'
);

select throws_ok(
    $$ select nextval('public.invitations_id_seq') $$,
    '42501',
    null,
    'anon no puede consumir valores de las secuencias de public'
);

select throws_ok(
    $$ select public.is_super_admin() $$,
    '42501',
    null,
    'anon no puede ejecutar funciones de public'
);

-- ---------------------------------------------------------------------------
-- 2 y 4. Un usuario autenticado cualquiera: misma visibilidad, sin escritura
-- ---------------------------------------------------------------------------

set local role postgres;

select tests.create_supabase_user('blog_reader', 'blog-reader@test.com');
select pymekit.authenticate_as('blog_reader');

select results_eq(
    $$ select slug::text from public.blog_posts where slug like 'bt-%' order by slug $$,
    $$ values ('bt-publicada') $$,
    'un usuario autenticado solo ve la entrada publicada'
);

select throws_ok(
    $$ insert into public.blog_posts (slug, title) values ('bt-user', 'Usuario') $$,
    '42501',
    null,
    'authenticated no puede crear entradas'
);

select throws_ok(
    $$ update public.blog_posts set title = 'Cambiado' where slug = 'bt-publicada' $$,
    '42501',
    null,
    'authenticated no puede modificar entradas'
);

select throws_ok(
    $$ delete from public.blog_posts where slug = 'bt-publicada' $$,
    '42501',
    null,
    'authenticated no puede borrar entradas'
);

select throws_ok(
    $$ update public.blog_categories set name = 'X' $$,
    '42501',
    null,
    'authenticated no puede modificar categorías'
);

select throws_ok(
    $$ delete from public.blog_tags $$,
    '42501',
    null,
    'authenticated no puede borrar etiquetas'
);

select throws_ok(
    $$ insert into public.blog_post_tags (post_id, tag_id)
       select post.id, tag.id from public.blog_posts as post, public.blog_tags as tag limit 1 $$,
    '42501',
    null,
    'authenticated no puede vincular etiquetas'
);

-- ---------------------------------------------------------------------------
-- 4 y 5. Privilegios en el catálogo (como `postgres`)
-- ---------------------------------------------------------------------------

set local role postgres;

select is_empty(
    $$
      select c.relname || ' / ' || r.role || ' / ' || p.priv
      from pg_class c
      cross join (values ('anon'), ('authenticated'), ('service_role')) as r (role)
      cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p (priv)
      where c.oid in ('public.blog_posts'::regclass, 'public.blog_categories'::regclass,
                      'public.blog_tags'::regclass, 'public.blog_post_tags'::regclass)
        and has_table_privilege(r.role, c.oid, p.priv)
    $$,
    'Ningún rol de la API tiene TRUNCATE/REFERENCES/TRIGGER sobre el blog'
);

select is_empty(
    $$
      select c.relname || ' / ' || r.role || ' / ' || p.priv
      from pg_class c
      cross join (values ('anon'), ('authenticated')) as r (role)
      cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) as p (priv)
      where c.oid in ('public.blog_posts'::regclass, 'public.blog_categories'::regclass,
                      'public.blog_tags'::regclass, 'public.blog_post_tags'::regclass)
        and (has_table_privilege(r.role, c.oid, p.priv)
             -- DELETE no existe a nivel de columna
             or (p.priv <> 'DELETE' and has_any_column_privilege(r.role, c.oid, p.priv)))
    $$,
    'anon y authenticated no tienen INSERT/UPDATE/DELETE sobre el blog'
);

select ok(
    not has_table_privilege('anon', 'public.blog_posts', 'SELECT')
    and not has_column_privilege('anon', 'public.blog_posts', 'created_by', 'SELECT')
    and not has_column_privilege('anon', 'public.blog_posts', 'updated_by', 'SELECT')
    and not has_column_privilege('anon', 'public.blog_posts', 'author_id', 'SELECT')
    and has_column_privilege('anon', 'public.blog_posts', 'content', 'SELECT'),
    'blog_posts se lee por columnas, sin los identificadores de usuario (B-35)'
);

select ok(
    not has_column_privilege('authenticated', 'public.blog_posts', 'created_by', 'SELECT')
    and not has_column_privilege('authenticated', 'public.blog_posts', 'author_id', 'SELECT'),
    'authenticated tampoco lee los identificadores de usuario de blog_posts'
);

select ok(
    has_schema_privilege('anon', 'public', 'USAGE')
    and not has_schema_privilege('anon', 'public', 'CREATE'),
    'anon tiene usage (y no create) sobre public'
);

select is_empty(
    $$
      select c.relname
      from pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and has_any_column_privilege('anon', c.oid, 'SELECT')
        and c.relname not in ('blog_posts', 'blog_categories', 'blog_tags', 'blog_post_tags')
    $$,
    'anon no puede leer ninguna tabla ni vista de public salvo las del blog'
);

select is_empty(
    $$
      select c.relname
      from pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind = 'S'
        and (has_sequence_privilege('anon', c.oid, 'USAGE')
             or has_sequence_privilege('anon', c.oid, 'SELECT')
             or has_sequence_privilege('anon', c.oid, 'UPDATE'))
    $$,
    'anon no tiene privilegios sobre las secuencias de public'
);

select is_empty(
    $$
      select p.oid::regprocedure::text
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and has_function_privilege('anon', p.oid, 'EXECUTE')
    $$,
    'anon no puede ejecutar ninguna función de public'
);

-- ---------------------------------------------------------------------------
-- 6. Escritura desde el CMS
-- ---------------------------------------------------------------------------

-- Root: el super-admin del seed (rol Root asignado por 53-cms-super-admin),
-- con segundo factor (sesión aal2), como en el CMS real
select pymekit.set_identifier('blog_root', 'super-admin@pymekit.test');
select pymekit.set_identifier('blog_staff', 'cms-staff@pymekit.test');

select tests.authenticate_as('blog_root');
select pymekit.set_session_aal('aal2');

select ok(cms.verify_admin_access(), 'Root (aal2) supera verify_admin_access');

select is(
    (cms.insert_record(
        'public',
        'blog_posts',
        '{"slug": "bt-desde-el-cms", "title": "Desde el CMS", "content": "## Hola", "status": "published"}'::jsonb
    ) ->> 'success')::boolean,
    true,
    'Root puede crear una entrada con cms.insert_record'
);

select is(
    (cms.insert_record(
        'public',
        'blog_post_tags',
        jsonb_build_object(
            'post_id', (select id from public.blog_posts where slug = 'bt-desde-el-cms'),
            'tag_id', (select id from public.blog_tags where slug = 'bt-visible')
        )
    ) ->> 'success')::boolean,
    true,
    'Root puede vincular una etiqueta a la entrada (relación muchos a muchos)'
);

set local role postgres;

select ok(
    (select published_at is not null and published_at <= now()
     from public.blog_posts where slug = 'bt-desde-el-cms'),
    'Al publicar sin fecha, published_at se fija a ahora'
);

select is(
    (select author_id from public.blog_posts where slug = 'bt-desde-el-cms'),
    'c5b930c9-0a76-412e-a836-4bc4849a3270'::uuid,
    'Sin autor explícito, la entrada se firma con la cuenta personal de quien la crea'
);

select is(
    (select created_by from public.blog_posts where slug = 'bt-desde-el-cms'),
    'c5b930c9-0a76-412e-a836-4bc4849a3270'::uuid,
    'created_by registra a quien creó la entrada desde el CMS'
);

-- La entrada creada desde el CMS es visible para la web
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select isnt_empty(
    $$ select 1 from public.blog_posts where slug = 'bt-desde-el-cms' $$,
    'La entrada publicada desde el CMS es visible para anon'
);

-- Soporte: acceso al CMS pero sin permiso sobre el blog
set local role postgres;

select tests.authenticate_as('blog_staff');
select pymekit.set_session_aal('aal2');

select ok(cms.verify_admin_access(), 'Soporte (aal2) supera verify_admin_access');

select ok(
    not cms.has_data_permission('insert'::cms.system_action, 'public', 'blog_posts'),
    'Soporte no tiene permiso de inserción sobre blog_posts'
);

select is(
    (cms.insert_record(
        'public',
        'blog_posts',
        '{"slug": "bt-desde-soporte", "title": "Soporte", "status": "published"}'::jsonb
    ) ->> 'success')::boolean,
    false,
    'Soporte no puede crear entradas con cms.insert_record'
);

select is(
    (cms.update_record(
        'public',
        'blog_posts',
        (select id::text from public.blog_posts where slug = 'bt-publicada'),
        '{"title": "Modificada por soporte"}'::jsonb
    ) ->> 'success')::boolean,
    false,
    'Soporte no puede modificar entradas con cms.update_record'
);

set local role postgres;

select is_empty(
    $$ select 1 from public.blog_posts
       where slug = 'bt-desde-soporte' or title = 'Modificada por soporte' $$,
    'Ninguna escritura de soporte llegó a la tabla'
);

-- ---------------------------------------------------------------------------
-- Metadatos del CMS (migración 20260930140100_cms_display_formats)
-- ---------------------------------------------------------------------------

select is(
    (select display_format from cms.table_metadata
     where schema_name = 'public' and table_name = 'blog_posts'),
    '{title}',
    'Las entradas se muestran por su título en las relaciones del CMS'
);

select results_eq(
    $$ select rel.value ->> 'target_schema', rel.value ->> 'target_table'
       from cms.table_metadata, jsonb_array_elements(relations_config) as rel(value)
       where schema_name = 'public' and table_name = 'accounts_memberships'
         and rel.value ->> 'source_column' = 'user_id' $$,
    $$ values ('public', 'accounts') $$,
    'accounts_memberships.user_id se muestra con la cuenta personal (relación virtual)'
);

select * from finish();

rollback;
