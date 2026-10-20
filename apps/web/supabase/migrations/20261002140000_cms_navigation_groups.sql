/*
 * Áreas de negocio para la navegación del CMS (F3c).
 *
 * La consola de administración agrupa las tablas por ÁREA («Blog»,
 * «Cuentas», «Facturación», «Sistema») en lugar de por esquema de
 * PostgreSQL: quien administra la web de una pyme busca «las entradas del
 * blog», no `public.blog_posts`. El área es un dato del CMS, igual que el
 * nombre visible, y se guarda en `cms.table_metadata.ui_config` con la clave
 * `navigation_group`:
 *
 *  - No hace falta DDL ni tocar permisos: `ui_config` ya es una columna
 *    `jsonb` que la API actualiza con el permiso de sistema `table:update`
 *    (la misma vía que la distribución de la ficha, `recordLayout`), y la
 *    política RLS `update_table_metadata` sigue siendo la que decide.
 *  - La sincronización (`cms.sync_managed_tables`) fusiona
 *    `EXCLUDED.ui_config || table_metadata.ui_config`: lo ya guardado gana,
 *    así que volver a sincronizar no borra el área.
 *
 * Además, como el área ya agrupa, se quita el prefijo de los nombres que
 * puso `20261002130000_cms_spanish_display_names.sql` («Cuentas:
 * invitaciones» → «Invitaciones»). Igual que allí, solo se cambia lo que
 * sigue siendo el valor puesto por las migraciones: un nombre o un área que
 * alguien haya personalizado en Ajustes → Recursos no se toca. Y se da un
 * orden inicial (`ordering`) solo a las tablas que no lo tienen, para que las
 * áreas salgan como Blog, Cuentas, Facturación, Sistema y, dentro de cada
 * una, la tabla principal primero.
 *
 * [TFG] RNF-08 · ADR-020.
 */

-- 0. `auth.users` hasta ahora solo la registraba el *seed*; se registra aquí
--    para que su nombre y su área también existan en una base de datos de
--    producción. Es idempotente y conserva lo ya configurado.
select cms.sync_managed_tables('auth', 'users');

-- 1. Valores por defecto de cada tabla: área, nombre sin prefijo (con el
--    nombre anterior, para no pisar personalizaciones) y orden inicial.
create temporary table cms_navigation_defaults (
    schema_name text not null,
    table_name text not null,
    navigation_group text not null,
    display_name text not null,
    previous_names text[] not null,
    ordering integer not null,
    primary key (schema_name, table_name)
) on commit drop;

insert into cms_navigation_defaults
    (schema_name, table_name, navigation_group, display_name, previous_names, ordering)
values
    -- Blog
    ('public', 'blog_posts', 'Blog', 'Entradas', array['Blog: entradas'], 100),
    ('public', 'blog_categories', 'Blog', 'Categorías', array['Blog: categorías'], 110),
    ('public', 'blog_tags', 'Blog', 'Etiquetas', array['Blog: etiquetas'], 120),
    ('public', 'blog_post_tags', 'Blog', 'Etiquetas de entradas',
     array['Blog: etiquetas de entradas'], 130),
    -- Cuentas
    ('public', 'accounts', 'Cuentas', 'Cuentas', array['Cuentas'], 200),
    ('public', 'accounts_memberships', 'Cuentas', 'Miembros', array['Cuentas: miembros'], 210),
    ('public', 'invitations', 'Cuentas', 'Invitaciones', array['Cuentas: invitaciones'], 220),
    ('public', 'roles', 'Cuentas', 'Roles', array['Cuentas: roles'], 230),
    ('public', 'role_permissions', 'Cuentas', 'Permisos de los roles',
     array['Cuentas: permisos de los roles'], 240),
    ('public', 'user_active_account', 'Cuentas', 'Cuenta activa',
     array['Cuentas: cuenta activa'], 250),
    ('public', 'notifications', 'Cuentas', 'Notificaciones', array['Notificaciones'], 260),
    -- Facturación
    ('public', 'billing_customers', 'Facturación', 'Clientes', array['Facturación: clientes'], 300),
    ('public', 'subscriptions', 'Facturación', 'Suscripciones',
     array['Facturación: suscripciones'], 310),
    ('public', 'subscription_items', 'Facturación', 'Líneas de suscripción',
     array['Facturación: líneas de suscripción'], 320),
    ('public', 'orders', 'Facturación', 'Pedidos', array['Facturación: pedidos'], 330),
    ('public', 'order_items', 'Facturación', 'Líneas de pedido',
     array['Facturación: líneas de pedido'], 340),
    -- Sistema
    ('public', 'config', 'Sistema', 'Configuración', array['Configuración de la plataforma'], 400),
    ('public', 'nonces', 'Sistema', 'Códigos de un solo uso',
     array['Seguridad: códigos de un solo uso'], 410),
    ('auth', 'users', 'Sistema', 'Usuarios (Auth)', array['Usuarios (Auth)'], 420);

-- 2. Área: solo si la tabla todavía no tiene una.
update cms.table_metadata as meta
set ui_config = coalesce(meta.ui_config, '{}'::jsonb)
        || jsonb_build_object('navigation_group', defaults.navigation_group)
from cms_navigation_defaults as defaults
where meta.schema_name = defaults.schema_name
  and meta.table_name = defaults.table_name
  and nullif(btrim(meta.ui_config ->> 'navigation_group'), '') is null;

-- 3. Nombre visible: solo si sigue siendo el de una migración anterior o el
--    generado automáticamente a partir del identificador (caso de
--    `auth.users`, que antes de esta migración no estaba registrada).
update cms.table_metadata as meta
set display_name = defaults.display_name
from cms_navigation_defaults as defaults
where meta.schema_name = defaults.schema_name
  and meta.table_name = defaults.table_name
  and (
      meta.display_name = any (defaults.previous_names)
      or meta.display_name is not distinct from cms.generate_display_name(defaults.table_name)
  );

-- 4. Orden inicial: solo para las tablas sin orden propio.
update cms.table_metadata as meta
set ordering = defaults.ordering
from cms_navigation_defaults as defaults
where meta.schema_name = defaults.schema_name
  and meta.table_name = defaults.table_name
  and meta.ordering is null;
