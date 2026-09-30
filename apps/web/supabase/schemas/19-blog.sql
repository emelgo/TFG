/*
 * -------------------------------------------------------
 * Sección: Blog (contenido público gestionado desde el CMS)
 *
 * Tablas del blog de la web pública: entradas, categorías, etiquetas y la
 * tabla intermedia entradas ↔ etiquetas (una relación muchos a muchos que el
 * CMS muestra y edita en la ficha de cada entrada).
 *
 * Es el caso de uso de «gestión de contenidos» de la propuesta: el personal
 * redacta y publica desde el CMS (`/admin/cms`) y la web lo muestra en
 * `/blog` y `/blog/$slug`. No hay un segundo CMS de ficheros (ADR-004).
 *
 * Modelo de seguridad:
 *
 *  - **Lectura pública.** `anon` y `authenticated` solo leen lo publicado
 *    (`status = 'published'` y `published_at <= now()`), las categorías, las
 *    etiquetas y las etiquetas de las entradas publicadas. Los borradores, lo
 *    archivado y lo programado para el futuro no existen para la web.
 *  - **Escritura solo desde el CMS o el servidor.** Ni `anon` ni
 *    `authenticated` tienen INSERT/UPDATE/DELETE. El CMS escribe con sus
 *    funciones `security definer` (`cms.insert_record`, `cms.update_record`…),
 *    que comprueban el permiso de datos del RBAC del CMS sobre cada tabla, y
 *    `service_role` conserva el acceso completo para tareas de servidor.
 *  - **Sin política restrictiva de MFA.** Las demás tablas de `public` añaden
 *    `restrict_mfa_*` para `authenticated` (13-mfa.sql), porque guardan datos
 *    privados. Aquí solo se puede leer lo que ya es público para `anon`: con
 *    la política, un usuario con MFA configurado y sesión aal1 vería el blog
 *    vacío mientras un visitante anónimo lo ve entero, sin proteger nada. La
 *    escritura no pasa por RLS (no hay `grant`) sino por el CMS, que ya exige
 *    MFA en `cms.verify_admin_access()`.
 *
 * [TFG] RF-01 · RF-09 · RNF-02 · ADR-017: blog en la base de datos,
 * gestionado desde el CMS, con la autorización aplicada en PostgreSQL.
 * -------------------------------------------------------
 */

/*
 * Apertura mínima del esquema `public` a `anon`
 *
 * Hasta ahora `anon` no tenía ni `usage` sobre `public` (00-privileges.sql):
 * la web no ofrecía nada público desde la base de datos. El blog es el primer
 * contenido que un visitante sin sesión lee a través de la API de datos, y
 * para eso necesita `usage` sobre el esquema. `usage` por sí solo no da
 * acceso a nada: cada tabla, vista, secuencia y función exige además su
 * propio privilegio.
 *
 * Antes de abrirlo se retira a `anon` cualquier privilegio residual sobre las
 * tablas, vistas y secuencias que ya existen: las vistas de cuentas (con
 * `security_invoker`, así que no devolverían datos) y las secuencias
 * `serial` (con `usage`, `anon` podría consumir valores con `nextval()`). Las
 * funciones de `public` ya no son ejecutables por `anon` (00-privileges.sql)
 * y los privilegios por defecto dejan limpias las tablas futuras. El test
 * `blog.test.sql` comprueba que `anon` solo puede leer las tablas del blog.
 *
 * [TFG] RNF-02: el esquema se abre solo después de cerrar todo lo demás.
 */
revoke all privileges on all tables in schema public from anon;

revoke all privileges on all sequences in schema public from anon;

grant usage on schema public to anon;

-- Estado editorial de una entrada. Solo `published` es visible en la web.
create type public.blog_post_status as enum('draft', 'published', 'archived');

comment on type public.blog_post_status is
  'Estado editorial de una entrada del blog: borrador, publicada o archivada';

/*
 * -------------------------------------------------------
 * Tabla: categorías del blog
 * Cada entrada pertenece como mucho a una categoría; la web filtra el listado
 * por categoría con `/blog?category=<slug>`.
 * -------------------------------------------------------
 */
create table if not exists public.blog_categories (
  id uuid not null default extensions.uuid_generate_v4(),
  name varchar(100) not null,
  slug varchar(100) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  constraint blog_categories_slug_key unique (slug),
  constraint blog_categories_name_not_blank check (length(trim(name)) > 0),
  -- El slug va en la URL: minúsculas, dígitos y guiones sueltos
  constraint blog_categories_slug_format check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  )
);

comment on table public.blog_categories is 'Categorías de las entradas del blog';

comment on column public.blog_categories.name is 'Nombre visible de la categoría';

comment on column public.blog_categories.slug is
  'Identificador de la categoría en la URL (minúsculas, dígitos y guiones)';

alter table public.blog_categories enable row level security;

-- anon también: los valores por defecto de Supabase le conceden TRUNCATE,
-- que ignora RLS
revoke all on public.blog_categories from anon, authenticated, service_role;

-- service_role conserva el acceso completo (tareas de servidor)
grant select, insert, update, delete on table public.blog_categories to service_role;

-- La web solo lee: las escrituras van por las funciones del CMS
grant select on table public.blog_categories to anon, authenticated;

create trigger blog_categories_set_timestamps
  before insert or update on public.blog_categories
  for each row execute function public.trigger_set_timestamps();

-- Las categorías son públicas: cualquiera puede leerlas (no hay datos privados)
create policy blog_categories_read on public.blog_categories for select
  to anon, authenticated using (true);

/*
 * -------------------------------------------------------
 * Tabla: etiquetas del blog
 * Relación muchos a muchos con las entradas (`blog_post_tags`).
 * -------------------------------------------------------
 */
create table if not exists public.blog_tags (
  id uuid not null default extensions.uuid_generate_v4(),
  name varchar(100) not null,
  slug varchar(100) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  constraint blog_tags_slug_key unique (slug),
  constraint blog_tags_name_not_blank check (length(trim(name)) > 0),
  constraint blog_tags_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

comment on table public.blog_tags is 'Etiquetas de las entradas del blog';

comment on column public.blog_tags.name is 'Nombre visible de la etiqueta';

comment on column public.blog_tags.slug is
  'Identificador de la etiqueta en la URL (minúsculas, dígitos y guiones)';

alter table public.blog_tags enable row level security;

revoke all on public.blog_tags from anon, authenticated, service_role;

grant select, insert, update, delete on table public.blog_tags to service_role;

grant select on table public.blog_tags to anon, authenticated;

create trigger blog_tags_set_timestamps
  before insert or update on public.blog_tags
  for each row execute function public.trigger_set_timestamps();

-- Las etiquetas son públicas, igual que las categorías
create policy blog_tags_read on public.blog_tags for select
  to anon, authenticated using (true);

/*
 * -------------------------------------------------------
 * Tabla: entradas del blog
 * El contenido se guarda en Markdown y la web lo renderiza sin permitir HTML
 * crudo (ver `@pymekit/ui/markdown`).
 * -------------------------------------------------------
 */
create table if not exists public.blog_posts (
  id uuid not null default extensions.uuid_generate_v4(),
  slug varchar(200) not null,
  title varchar(200) not null,
  excerpt varchar(500),
  content text not null default '',
  cover_image_url varchar(2048),
  status public.blog_post_status not null default 'draft',
  published_at timestamptz,
  -- `set null`: la entrada sobrevive a su autor (se borra la cuenta, no el
  -- contenido publicado)
  author_id uuid references public.accounts (id) on delete set null,
  category_id uuid references public.blog_categories (id) on delete set null,
  seo_title varchar(200),
  seo_description varchar(300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- `set null`, nunca el NO ACTION por defecto: la fila no debe impedir
  -- borrar al usuario que la creó o la editó por última vez
  created_by uuid references auth.users on delete set null,
  updated_by uuid references auth.users on delete set null,
  primary key (id),
  constraint blog_posts_slug_key unique (slug),
  constraint blog_posts_title_not_blank check (length(trim(title)) > 0),
  constraint blog_posts_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Límite generoso que evita documentos desmesurados en cada petición
  constraint blog_posts_content_length check (length(content) <= 200000),
  -- [TFG] RNF-02 · Solo imágenes servidas por HTTPS: evita contenido mixto y
  -- esquemas peligrosos (`javascript:`, `data:`) en el atributo `src`
  constraint blog_posts_cover_image_https check (
    cover_image_url is null or cover_image_url ~ '^https://[^\s]+$'
  )
);

comment on table public.blog_posts is
  'Entradas del blog de la web pública, redactadas y publicadas desde el CMS';

comment on column public.blog_posts.slug is
  'Identificador de la entrada en la URL (/blog/<slug>)';

comment on column public.blog_posts.title is 'Título de la entrada';

comment on column public.blog_posts.excerpt is
  'Resumen corto que se muestra en el listado del blog';

comment on column public.blog_posts.content is
  'Cuerpo de la entrada en Markdown (sin HTML: la web no lo renderiza)';

comment on column public.blog_posts.cover_image_url is
  'Imagen de portada (solo URL https)';

comment on column public.blog_posts.status is
  'Estado editorial; solo las publicadas son visibles en la web';

comment on column public.blog_posts.published_at is
  'Fecha de publicación; si está en el futuro, la entrada queda programada';

comment on column public.blog_posts.author_id is
  'Cuenta personal de quien firma la entrada';

comment on column public.blog_posts.category_id is 'Categoría de la entrada';

comment on column public.blog_posts.seo_title is
  'Título para buscadores (si falta, se usa el título)';

comment on column public.blog_posts.seo_description is
  'Descripción para buscadores (si falta, se usa el resumen)';

alter table public.blog_posts enable row level security;

revoke all on public.blog_posts from anon, authenticated, service_role;

grant select, insert, update, delete on table public.blog_posts to service_role;

-- [TFG] RNF-02 · Lectura por columnas: la web no necesita saber qué usuario
-- creó o editó una entrada ni el id de su autor (son identificadores de
-- usuario de Auth). Se conceden solo las columnas públicas; `select *`
-- desde la API falla a propósito. El CMS lee todas las columnas con sus
-- funciones `security definer`, así que no le afecta.
grant select (
  id,
  slug,
  title,
  excerpt,
  content,
  cover_image_url,
  status,
  published_at,
  category_id,
  seo_title,
  seo_description,
  created_at,
  updated_at
) on table public.blog_posts to anon, authenticated;

create trigger blog_posts_set_timestamps
  before insert or update on public.blog_posts
  for each row execute function public.trigger_set_timestamps();

create trigger blog_posts_set_user_tracking
  before insert or update on public.blog_posts
  for each row execute function public.trigger_set_user_tracking();

/*
 * kit.set_blog_post_defaults
 *
 * Completa dos valores que el CMS no puede (o no debe) pedir a mano:
 *
 *  - `published_at`: al pasar a `published` sin fecha, se publica «ahora».
 *    Así basta con cambiar el estado en el CMS para que la entrada aparezca
 *    en la web; una fecha futura explícita la deja programada.
 *  - `author_id`: al crear una entrada sin autor, se firma con la cuenta
 *    personal de quien la crea (en PymeKit `accounts.id = auth.users.id`),
 *    si existe. Sin sesión (tareas de servidor) queda vacío.
 *
 * Es un *trigger* `security invoker`: no amplía los permisos de nadie, solo
 * rellena columnas de la fila que ya se está escribiendo.
 */
create or replace function kit.set_blog_post_defaults () returns trigger
set
  search_path = '' as $$
begin
    if new.status = 'published' and new.published_at is null then
        new.published_at := now();
    end if;

    if tg_op = 'INSERT' and new.author_id is null and auth.uid() is not null then
        select account.id
        into new.author_id
        from public.accounts as account
        where account.id = auth.uid()
          and account.is_personal_account;
    end if;

    return new;
end;
$$ language plpgsql;

create trigger blog_posts_set_defaults
  before insert or update on public.blog_posts
  for each row execute function kit.set_blog_post_defaults();

-- El listado público filtra por estado y ordena por fecha de publicación
create index if not exists ix_blog_posts_status_published_at
  on public.blog_posts (status, published_at desc);

-- Índices sobre las claves foráneas: filtro por categoría en la web y
-- borrado en cascada (`set null`) al borrar una cuenta o una categoría
create index if not exists ix_blog_posts_category_id
  on public.blog_posts (category_id);

create index if not exists ix_blog_posts_author_id
  on public.blog_posts (author_id);

-- [TFG] RNF-02 · Solo lo publicado y con fecha ya alcanzada es visible:
-- los borradores, lo archivado y lo programado no existen para la web.
create policy blog_posts_read_published on public.blog_posts for select
  to anon, authenticated using (
    status = 'published'
    and published_at <= now()
  );

/*
 * -------------------------------------------------------
 * Tabla intermedia: entradas ↔ etiquetas
 * Su clave primaria son las dos claves foráneas, que es lo que el CMS usa
 * para reconocerla como relación muchos a muchos.
 * -------------------------------------------------------
 */
create table if not exists public.blog_post_tags (
  post_id uuid not null references public.blog_posts (id) on delete cascade,
  tag_id uuid not null references public.blog_tags (id) on delete cascade,
  primary key (post_id, tag_id)
);

comment on table public.blog_post_tags is
  'Etiquetas de cada entrada del blog (relación muchos a muchos)';

comment on column public.blog_post_tags.post_id is 'Entrada etiquetada';

comment on column public.blog_post_tags.tag_id is 'Etiqueta aplicada';

alter table public.blog_post_tags enable row level security;

revoke all on public.blog_post_tags from anon, authenticated, service_role;

grant select, insert, update, delete on table public.blog_post_tags to service_role;

grant select on table public.blog_post_tags to anon, authenticated;

-- La clave primaria ya indexa `post_id`; este índice sirve la búsqueda
-- inversa (entradas de una etiqueta) y el borrado en cascada de etiquetas
create index if not exists ix_blog_post_tags_tag_id
  on public.blog_post_tags (tag_id);

-- Solo las etiquetas de entradas visibles: la consulta a `blog_posts` pasa
-- por su propia política, pero se repite la condición para que la regla se
-- entienda sin tener que leer la otra tabla
create policy blog_post_tags_read_published on public.blog_post_tags for select
  to anon, authenticated using (
    exists (
      select 1
      from public.blog_posts as post
      where post.id = post_id
        and post.status = 'published'
        and post.published_at <= now()
    )
  );
