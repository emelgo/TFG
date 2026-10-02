/*
 * Descripciones en español de las columnas de las tablas de PymeKit en el
 * CMS (ayuda de los formularios).
 *
 * Los formularios de crear y editar registros del explorador de datos
 * muestran un botón «?» junto a cada campo cuya columna tiene descripción
 * (`cms.table_metadata.columns_config.<columna>.description`). Hasta ahora
 * ninguna columna la tenía, así que quien gestiona la pyme veía nombres como
 * «Slug» o «Extracto» sin saber qué escribir. Aquí se rellena una
 * explicación breve, en lenguaje llano, para las tablas del blog, cuentas,
 * facturación, notificaciones y configuración.
 *
 * Mismo criterio que `20261002130000_cms_spanish_display_names.sql`:
 *   1. Un diccionario común por nombre de columna (los mismos nombres
 *      técnicos significan lo mismo en todas las tablas: `created_at`,
 *      `account_id`…).
 *   2. Casos por tabla, que tienen prioridad sobre el diccionario cuando la
 *      misma columna significa algo distinto (`status` de una entrada del
 *      blog no es el `status` de un pedido).
 *
 * Son DATOS de configuración, no esquema: se editan después en Ajustes →
 * Recursos → columna → «Descripción». Por eso solo se rellenan las
 * descripciones vacías: una descripción ya personalizada no se pisa, y
 * volver a aplicar la migración no cambia nada (es idempotente).
 *
 * [TFG] RNF-08 · ADR-020.
 */

create temporary table cms_column_descriptions (
    -- `null` = diccionario común; con valor = caso de esa tabla (`public`).
    table_name text,
    column_name text not null,
    description text not null
) on commit drop;

insert into cms_column_descriptions (table_name, column_name, description)
values
    -- 1. Diccionario común
    (null, 'id', 'Identificador único del registro. Lo genera el sistema; no hace falta rellenarlo.'),
    (null, 'name', 'Nombre que se muestra en la aplicación.'),
    (null, 'slug', 'Versión del nombre para la dirección web: en minúsculas, sin espacios ni tildes y con guiones (por ejemplo, «mi-primera-entrada»).'),
    (null, 'email', 'Dirección de correo electrónico.'),
    (null, 'created_at', 'Fecha y hora en que se creó el registro. Se rellena sola.'),
    (null, 'updated_at', 'Fecha y hora del último cambio. Se actualiza sola.'),
    (null, 'created_by', 'Usuario que creó el registro. Se rellena solo.'),
    (null, 'updated_by', 'Último usuario que modificó el registro. Se rellena solo.'),
    (null, 'expires_at', 'Fecha y hora a partir de la cual deja de ser válido.'),
    (null, 'metadata', 'Datos técnicos adicionales en formato JSON. Normalmente no hace falta tocarlos.'),
    (null, 'account_id', 'Cuenta (persona o equipo) a la que pertenece el registro.'),
    (null, 'user_id', 'Usuario al que se refiere el registro.'),
    (null, 'role', 'Rol dentro del equipo, que decide lo que la persona puede hacer.'),
    (null, 'provider', 'Proveedor de pagos que gestiona el cobro (por ejemplo, Stripe).'),
    (null, 'billing_provider', 'Proveedor de pagos que gestiona el cobro (por ejemplo, Stripe).'),
    (null, 'billing_customer_id', 'Cliente de facturación que paga.'),
    (null, 'customer_id', 'Identificador del cliente en el proveedor de pagos. Lo asigna el proveedor.'),
    (null, 'product_id', 'Identificador del producto en el proveedor de pagos.'),
    (null, 'variant_id', 'Identificador del precio o variante del producto en el proveedor de pagos.'),
    (null, 'price_amount', 'Precio por unidad, en la moneda del cobro.'),
    (null, 'quantity', 'Número de unidades.'),
    (null, 'currency', 'Moneda del cobro, en código de tres letras (por ejemplo, EUR).'),
    (null, 'status', 'Situación actual del registro.'),
    (null, 'type', 'Tipo del registro.'),

    -- 2. Blog
    ('blog_posts', 'title', 'Título de la entrada, tal como lo verán los lectores.'),
    ('blog_posts', 'excerpt', 'Resumen breve (una o dos frases) que aparece en el listado del blog y al compartir la entrada.'),
    ('blog_posts', 'content', 'Texto completo de la entrada. Admite formato Markdown (negritas, listas, enlaces…).'),
    ('blog_posts', 'cover_image_url', 'Dirección de la imagen de portada que se muestra en la cabecera y en el listado.'),
    ('blog_posts', 'status', 'Borrador: solo se ve en la consola. Publicada: visible en el blog. Archivada: retirada del blog sin borrarla.'),
    ('blog_posts', 'published_at', 'Fecha de publicación que se muestra en el blog.'),
    ('blog_posts', 'author_id', 'Persona que firma la entrada.'),
    ('blog_posts', 'category_id', 'Categoría del blog en la que se clasifica la entrada.'),
    ('blog_posts', 'seo_title', 'Título para buscadores como Google. Si lo dejas vacío, se usa el título de la entrada.'),
    ('blog_posts', 'seo_description', 'Texto que muestran los buscadores bajo el título. Si lo dejas vacío, se usa el resumen.'),
    ('blog_categories', 'name', 'Nombre de la categoría, por ejemplo «Novedades» o «Consejos».'),
    ('blog_tags', 'name', 'Nombre de la etiqueta, por ejemplo «facturación» o «marketing».'),
    ('blog_post_tags', 'post_id', 'Entrada del blog a la que se asigna la etiqueta.'),
    ('blog_post_tags', 'tag_id', 'Etiqueta asignada a la entrada.'),

    -- 3. Cuentas y equipos
    ('accounts', 'name', 'Nombre de la persona o del equipo.'),
    ('accounts', 'email', 'Correo de contacto de la cuenta.'),
    ('accounts', 'is_personal_account', 'Sí: cuenta personal de un usuario. No: cuenta de equipo compartida por varias personas.'),
    ('accounts', 'primary_owner_user_id', 'Usuario propietario de la cuenta, con control total sobre ella.'),
    ('accounts', 'picture_url', 'Dirección de la imagen o logotipo de la cuenta.'),
    ('accounts', 'public_data', 'Datos públicos adicionales de la cuenta, en formato JSON.'),
    ('accounts', 'slug', 'Identificador del equipo en la dirección web. Solo lo tienen las cuentas de equipo.'),
    ('accounts_memberships', 'account_id', 'Equipo al que pertenece la persona.'),
    ('accounts_memberships', 'user_id', 'Persona que es miembro del equipo.'),
    ('accounts_memberships', 'account_role', 'Rol de la persona en el equipo, que decide lo que puede hacer.'),
    ('invitations', 'account_id', 'Equipo al que se invita.'),
    ('invitations', 'email', 'Correo de la persona invitada.'),
    ('invitations', 'role', 'Rol que tendrá la persona al aceptar la invitación.'),
    ('invitations', 'invited_by', 'Miembro del equipo que envió la invitación.'),
    ('invitations', 'invite_token', 'Código secreto del enlace de invitación. No lo compartas.'),
    ('invitations', 'expires_at', 'Fecha a partir de la cual el enlace de invitación deja de funcionar.'),
    ('invitations', 'sent_at', 'Fecha en que se envió el correo de invitación.'),
    ('invitations', 'last_send_attempt_at', 'Último intento de envío del correo de invitación.'),
    ('invitations', 'resend_count', 'Veces que se ha reenviado la invitación.'),
    ('roles', 'name', 'Nombre interno del rol de equipo (por ejemplo, «owner» o «member»).'),
    ('roles', 'hierarchy_level', 'Jerarquía del rol: cuanto menor el número, más autoridad dentro del equipo.'),
    ('role_permissions', 'role', 'Rol de equipo que recibe el permiso.'),
    ('role_permissions', 'permission', 'Acción que el rol puede hacer en el equipo (por ejemplo, gestionar la facturación).'),
    ('user_active_account', 'account_id', 'Última cuenta con la que trabajó el usuario; la aplicación la abre por defecto.'),

    -- 4. Facturación
    ('billing_customers', 'account_id', 'Cuenta que paga.'),
    ('billing_customers', 'email', 'Correo al que el proveedor de pagos envía los recibos.'),
    ('subscriptions', 'active', 'Sí si la suscripción da acceso al plan en este momento.'),
    ('subscriptions', 'status', 'Situación de la suscripción en el proveedor de pagos: activa, en prueba, impagada, cancelada…'),
    ('subscriptions', 'cancel_at_period_end', 'Sí si la suscripción se cancelará al terminar el periodo ya pagado.'),
    ('subscriptions', 'period_starts_at', 'Inicio del periodo de facturación actual.'),
    ('subscriptions', 'period_ends_at', 'Fin del periodo de facturación actual; en esa fecha se renueva o termina.'),
    ('subscriptions', 'trial_starts_at', 'Inicio del periodo de prueba gratuito, si lo hay.'),
    ('subscriptions', 'trial_ends_at', 'Fin del periodo de prueba gratuito, si lo hay.'),
    ('subscription_items', 'subscription_id', 'Suscripción a la que pertenece esta línea.'),
    ('subscription_items', 'type', 'Forma de cobro: precio fijo, por usuario o por uso.'),
    ('subscription_items', 'interval', 'Cada cuánto se cobra: mensual o anual.'),
    ('subscription_items', 'interval_count', 'Número de intervalos entre cobros (por ejemplo, 3 meses).'),
    ('orders', 'status', 'Situación del pago único: pendiente, pagado o fallido.'),
    ('orders', 'total_amount', 'Importe total del pedido, en la moneda del cobro.'),
    ('order_items', 'order_id', 'Pedido al que pertenece esta línea.'),

    -- 5. Notificaciones
    ('notifications', 'account_id', 'Cuenta que recibe el aviso.'),
    ('notifications', 'body', 'Texto del aviso que verá la persona.'),
    ('notifications', 'link', 'Página a la que lleva el aviso al pulsarlo (opcional).'),
    ('notifications', 'channel', 'Por dónde se envía: dentro de la aplicación o por correo.'),
    ('notifications', 'type', 'Importancia del aviso: información, advertencia o error.'),
    ('notifications', 'dismissed', 'Sí si la persona ya ha cerrado el aviso.'),
    ('notifications', 'expires_at', 'A partir de esta fecha el aviso deja de mostrarse.'),

    -- 6. Configuración de la plataforma
    ('config', 'enable_team_accounts', 'Permite crear cuentas de equipo para trabajar con otras personas.'),
    ('config', 'enable_account_billing', 'Permite que las cuentas personales contraten un plan de pago.'),
    ('config', 'enable_team_account_billing', 'Permite que las cuentas de equipo contraten un plan de pago.'),
    ('config', 'billing_provider', 'Proveedor de pagos que usa la plataforma para cobrar.');

-- Se reconstruye `columns_config` de cada tabla cambiando solo la clave
-- `description` de las columnas que no la tienen (o la tienen vacía) y
-- tienen texto en el diccionario; el resto de la configuración de la
-- columna (nombre, visibilidad, formato…) se mantiene intacta.
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
where meta.schema_name = 'public'
  and meta.columns_config is not null
  and meta.columns_config <> '{}'::jsonb
  and meta.table_name in (
      'blog_posts', 'blog_categories', 'blog_tags', 'blog_post_tags',
      'accounts', 'accounts_memberships', 'invitations', 'roles',
      'role_permissions', 'user_active_account',
      'billing_customers', 'subscriptions', 'subscription_items',
      'orders', 'order_items', 'notifications', 'config'
  );
