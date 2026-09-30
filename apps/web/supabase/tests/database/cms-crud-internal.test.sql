-- Regresión de B-45: las funciones internas del CRUD del CMS no son
-- ejecutables por los roles de la API.
--
-- `cms._delete_record_impl` concatena cláusulas WHERE en crudo y se ejecuta
-- con RLS desactivado. Si `authenticated` pudiera llamarla, un miembro del
-- personal con permiso de borrado en una tabla podría inyectar SQL y leer
-- cualquier dato a través del texto de error. Solo la invocan las funciones
-- SECURITY DEFINER (`delete_record`, `delete_record_by_conditions`).
--
-- [TFG] RNF-02.

begin;

select plan(6);

-- -------------------------------------------------------
-- 1. Nadie de la API puede ejecutar las funciones internas
-- -------------------------------------------------------

select ok(
    not has_function_privilege('authenticated', 'cms._delete_record_impl(text, text, text[])', 'execute'),
    'authenticated no puede ejecutar _delete_record_impl'
);

select ok(
    not has_function_privilege('anon', 'cms._delete_record_impl(text, text, text[])', 'execute'),
    'anon no puede ejecutar _delete_record_impl'
);

select ok(
    not has_function_privilege('authenticated', 'cms._update_record_impl(text, text, text[], jsonb)', 'execute'),
    'authenticated no puede ejecutar _update_record_impl'
);

-- -------------------------------------------------------
-- 2. El borrado legítimo sigue funcionando por la función pública
-- -------------------------------------------------------

select tests.create_supabase_user('crud_root', 'crud-root@pymekit.test');

update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "super-admin"}'::jsonb
where id = tests.get_supabase_uid('crud_root');

insert into public.blog_tags (id, name, slug)
values ('00000000-0000-0000-0000-00000000b45a', 'Etiqueta B-45', 'etiqueta-b45');

select tests.authenticate_as('crud_root');
select pymekit.set_session_aal('aal2');

-- El intento de inyección por la función interna se rechaza por permisos.
select throws_ok(
    $$ select cms._delete_record_impl('public', 'blog_tags',
         array['(select 1)::int = 1']) $$,
    '42501',
    null,
    'Incluso Root recibe 42501 al llamar directamente a _delete_record_impl'
);

select is(
    (cms.delete_record('public', 'blog_tags', '00000000-0000-0000-0000-00000000b45a') ->> 'success'),
    'true',
    'Root sigue pudiendo borrar con delete_record (SECURITY DEFINER)'
);

set local role postgres;

select is_empty(
    $$ select 1 from public.blog_tags where id = '00000000-0000-0000-0000-00000000b45a' $$,
    'La fila se ha borrado realmente'
);

select * from finish();

rollback;
