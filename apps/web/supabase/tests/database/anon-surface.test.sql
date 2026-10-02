-- Superficie de ataque de `anon` (visitante sin sesión) en la base de datos.
--
-- Desde la F2.6b (ADR-017, blog público) `anon` tiene `usage` sobre el
-- esquema `public`. Antes no lo tenía, y el endurecimiento de
-- 20260811000000_revoke_residual_privileges.sql y
-- 20260915100557_revoke_anon_dml.sql se apoyaba en ello: sin `usage`, ningún
-- privilegio residual era alcanzable. Ahora cualquier tabla, vista, secuencia
-- o función de `public` a la que `anon` tenga acceso queda expuesta por
-- PostgREST (`/rest/v1/<tabla>` y `/rest/v1/rpc/<función>`).
--
-- Este test enumera esa superficie en el catálogo y la compara con el
-- conjunto permitido EXACTO. Si alguien añade un `grant` a `anon`, crea una
-- función ejecutable por PUBLIC o instala una extensión en `public` (sus
-- objetos los crea `supabase_admin`, cuyos privilegios por defecto sí
-- conceden todo a `anon`), el test falla.
--
-- [TFG] RNF-02 · ADR-017.

begin;

select no_plan();

-- ---------------------------------------------------------------------------
-- 1. Esquemas: `anon` solo gana `usage` (nunca `create`) sobre `public`, y
--    ninguno de los esquemas propios (`kit`, `cms`, `demo`)
-- ---------------------------------------------------------------------------

select ok(
    has_schema_privilege('anon', 'public', 'USAGE')
    and not has_schema_privilege('anon', 'public', 'CREATE'),
    'anon tiene usage, pero no create, sobre public'
);

select is_empty(
    $$
      select n.nspname
      from pg_namespace n
      where n.nspname in ('kit', 'cms', 'demo', 'vault')
        and (has_schema_privilege('anon', n.oid, 'USAGE')
             or has_schema_privilege('anon', n.oid, 'CREATE'))
    $$,
    'anon no tiene acceso a los esquemas kit, cms, demo ni vault'
);

-- ---------------------------------------------------------------------------
-- 2. Funciones: ninguna función de public es ejecutable por anon (ni
--    directamente ni a través de PUBLIC). Cubre las RPC sensibles:
--    create_team_account, accept_invitation, transfer_team_account_ownership,
--    add_invitations_to_account, upsert_subscription/upsert_order, nonces...
-- ---------------------------------------------------------------------------

select is_empty(
    $$
      select p.oid::regprocedure::text
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and has_function_privilege('anon', p.oid, 'EXECUTE')
    $$,
    'anon no puede ejecutar ninguna función de public'
);

select is_empty(
    $$
      select p.oid::regprocedure::text
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a
      where p.pronamespace = 'public'::regnamespace
        and a.grantee = 0
    $$,
    'Ninguna función de public es ejecutable por PUBLIC'
);

-- Sonda real: la llamada como anon falla por permisos, no por el esquema
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select throws_ok(
    $$ select public.create_team_account('Anon Co', null::uuid, 'anon-co') $$,
    '42501',
    'permission denied for function create_team_account',
    'anon no puede crear cuentas de equipo'
);

select throws_ok(
    $$ select public.accept_invitation('token', null::uuid) $$,
    '42501',
    'permission denied for function accept_invitation',
    'anon no puede aceptar invitaciones'
);

select throws_ok(
    $$ select public.verify_nonce('token', 'purpose') $$,
    '42501',
    'permission denied for function verify_nonce',
    'anon no puede consumir tokens de un solo uso'
);

select throws_ok(
    $$ select public.get_upper_system_role() $$,
    '42501',
    'permission denied for function get_upper_system_role',
    'anon no puede consultar la jerarquía de roles'
);

set local role postgres;

-- ---------------------------------------------------------------------------
-- 3. Tablas, vistas y secuencias: el conjunto de privilegios de anon en
--    public es EXACTAMENTE la lectura del blog
-- ---------------------------------------------------------------------------

-- Privilegios a nivel de tabla (incluye TRUNCATE, REFERENCES, TRIGGER)
select results_eq(
    $$
      select (c.relname::text || ':' || p.priv) collate "default"
      from pg_class c
      cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                         ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p (priv)
      where c.relnamespace = 'public'::regnamespace
        and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and has_table_privilege('anon', c.oid, p.priv)
      order by 1
    $$,
    $$ values ('blog_categories:SELECT'), ('blog_post_tags:SELECT'), ('blog_tags:SELECT') $$,
    'anon solo tiene SELECT (de tabla) sobre categorías, etiquetas y etiquetas de entradas'
);

-- Privilegios por columna: blog_posts se lee sin los identificadores de
-- usuario (author_id, created_by, updated_by) y sin escritura alguna
select results_eq(
    $$
      select (c.relname::text || '.' || a.attname::text || ':' || p.priv) collate "default"
      from pg_class c
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) as p (priv)
      where c.relnamespace = 'public'::regnamespace
        and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and c.relname not in ('blog_categories', 'blog_tags', 'blog_post_tags')
        and has_column_privilege('anon', c.oid, a.attnum, p.priv)
      order by 1
    $$,
    $$
      select 'blog_posts.' || col || ':SELECT'
      from unnest(array[
        'category_id', 'content', 'cover_image_url', 'created_at', 'excerpt',
        'id', 'published_at', 'seo_description', 'seo_title', 'slug',
        'status', 'title', 'updated_at'
      ]) as col
      order by 1
    $$,
    'anon solo lee las columnas públicas de blog_posts, y nada de ninguna otra tabla'
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

-- Ningún objeto de public concede nada a PUBLIC (que incluye a anon)
select is_empty(
    $$
      select c.relname
      from pg_class c
      cross join lateral aclexplode(c.relacl) as a
      where c.relnamespace = 'public'::regnamespace
        and a.grantee = 0
    $$,
    'Ninguna tabla, vista ni secuencia de public concede privilegios a PUBLIC'
);

-- Las vistas de public ejecutan con los permisos de quien consulta
select is_empty(
    $$
      select c.relname
      from pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind = 'v'
        and not coalesce('security_invoker=true' = any (c.reloptions), false)
    $$,
    'Todas las vistas de public tienen security_invoker'
);

-- ---------------------------------------------------------------------------
-- 4. Objetos futuros: los privilegios por defecto no conceden nada a anon
-- ---------------------------------------------------------------------------

-- Objetos que crea `postgres` (migraciones, editor SQL)
select is_empty(
    $$
      select d.defaclobjtype::text || ' / ' || coalesce(n.nspname, '<global>')
      from pg_default_acl d
      left join pg_namespace n on n.oid = d.defaclnamespace
      cross join lateral aclexplode(d.defaclacl) as a
      where d.defaclrole = 'postgres'::regrole
        and (d.defaclnamespace = 0 or n.nspname = 'public')
        and a.grantee in (0, 'anon'::regrole)
    $$,
    'Los privilegios por defecto de postgres en public no conceden nada a anon ni a PUBLIC'
);

select ok(
    not exists (
        select 1
        from pg_default_acl d
        cross join lateral aclexplode(d.defaclacl) as a
        where d.defaclrole = 'postgres'::regrole
          and d.defaclnamespace = 0
          and d.defaclobjtype = 'f'
          and a.grantee = 0
    )
    and exists (
        select 1 from pg_default_acl d
        where d.defaclrole = 'postgres'::regrole
          and d.defaclnamespace = 0
          and d.defaclobjtype = 'f'
    ),
    'Las funciones nuevas de postgres no son ejecutables por PUBLIC por defecto'
);

-- Los privilegios por defecto de `supabase_admin` en public sí conceden todo
-- a anon, y `postgres` no puede cambiarlos. Por eso ningún objeto de public
-- puede pertenecer a otro rol (p. ej. una extensión instalada en public en
-- lugar de en `extensions`).
select is_empty(
    $$
      select 'relación ' || c.relname || ' de ' || pg_get_userbyid(c.relowner)
      from pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relowner <> 'postgres'::regrole
      union all
      select 'función ' || p.oid::regprocedure::text || ' de ' || pg_get_userbyid(p.proowner)
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proowner <> 'postgres'::regrole
    $$,
    'Todos los objetos de public pertenecen a postgres (ninguno hereda los privilegios por defecto de supabase_admin)'
);

select * from finish();

rollback;
