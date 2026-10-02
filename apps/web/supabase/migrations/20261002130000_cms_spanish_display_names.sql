/*
 * Nombres visibles en español para las tablas de PymeKit en el CMS (F3c).
 *
 * La sincronización del CMS (`cms.sync_managed_tables`) da a cada tabla y
 * columna un nombre generado a partir del identificador técnico
 * (`cms.generate_display_name`: «accounts» → «Accounts», «account_id» →
 * «Account »). Eso deja el explorador de datos en inglés aunque la interfaz
 * esté en español. Aquí se aplica el mismo criterio que ya seguían las tablas
 * del blog: un nombre en español, agrupado por área funcional con un prefijo
 * («Cuentas: invitaciones», «Facturación: suscripciones»), y una descripción.
 * El explorador muestra el nombre técnico al lado, así que no se pierde la
 * referencia a la tabla real.
 *
 * Son DATOS de configuración del CMS, no esquema: quien administra el CMS
 * puede cambiarlos después en Ajustes → Recursos. Por eso solo se sustituyen
 * los nombres que siguen siendo los generados automáticamente; un nombre ya
 * personalizado no se toca. La sincronización conserva los nombres
 * existentes (`coalesce` en su `on conflict`), así que no los revierte.
 *
 * [TFG] RNF-08 · ADR-020.
 */

-- 1. Tablas: nombre visible y descripción
update cms.table_metadata as meta
set display_name = names.display_name,
    description = coalesce(meta.description, names.description)
from (
    values
        ('public', 'accounts', 'Cuentas',
         'Cuentas personales y de equipo de la plataforma'),
        ('public', 'accounts_memberships', 'Cuentas: miembros',
         'Usuarios que pertenecen a cada cuenta de equipo y su rol'),
        ('public', 'invitations', 'Cuentas: invitaciones',
         'Invitaciones pendientes para unirse a una cuenta de equipo'),
        ('public', 'roles', 'Cuentas: roles',
         'Roles de los miembros de un equipo y su nivel jerárquico'),
        ('public', 'role_permissions', 'Cuentas: permisos de los roles',
         'Permisos que concede cada rol de equipo'),
        ('public', 'user_active_account', 'Cuentas: cuenta activa',
         'Última cuenta con la que ha trabajado cada usuario'),
        ('public', 'billing_customers', 'Facturación: clientes',
         'Cliente del proveedor de pagos asociado a cada cuenta'),
        ('public', 'subscriptions', 'Facturación: suscripciones',
         'Suscripciones de las cuentas a los planes de pago'),
        ('public', 'subscription_items', 'Facturación: líneas de suscripción',
         'Productos y precios incluidos en cada suscripción'),
        ('public', 'orders', 'Facturación: pedidos',
         'Pagos únicos realizados por las cuentas'),
        ('public', 'order_items', 'Facturación: líneas de pedido',
         'Productos incluidos en cada pedido'),
        ('public', 'notifications', 'Notificaciones',
         'Avisos que reciben las cuentas en la aplicación o por correo'),
        ('public', 'config', 'Configuración de la plataforma',
         'Interruptores globales: equipos y facturación'),
        ('public', 'nonces', 'Seguridad: códigos de un solo uso',
         'Códigos temporales para verificar operaciones sensibles'),
        ('auth', 'users', 'Usuarios (Auth)',
         'Usuarios registrados en el servicio de autenticación')
) as names (schema_name, table_name, display_name, description)
where meta.schema_name = names.schema_name
  and meta.table_name = names.table_name
  and meta.display_name is not distinct from cms.generate_display_name(names.table_name);

-- 2. Columnas: diccionario común por nombre de columna. Los mismos nombres
--    técnicos significan lo mismo en todas las tablas de PymeKit
--    (`created_at`, `account_id`…), así que un único diccionario evita
--    repetir la traducción tabla a tabla. Solo se aplica a las tablas del
--    apartado 1 (las del blog ya tenían sus nombres).
create temporary table cms_column_names (
    column_name text primary key,
    display_name text not null
) on commit drop;

insert into cms_column_names (column_name, display_name)
values
    -- Comunes
    ('id', 'ID'),
    ('name', 'Nombre'),
    ('slug', 'Slug'),
    ('email', 'Correo electrónico'),
    ('created_at', 'Creado el'),
    ('updated_at', 'Actualizado el'),
    ('created_by', 'Creado por'),
    ('updated_by', 'Actualizado por'),
    ('expires_at', 'Caduca el'),
    ('metadata', 'Metadatos'),
    ('type', 'Tipo'),
    ('status', 'Estado'),
    ('role', 'Rol'),
    -- Cuentas y equipos
    ('account_id', 'Cuenta'),
    ('user_id', 'Usuario'),
    ('primary_owner_user_id', 'Propietario principal'),
    ('is_personal_account', 'Cuenta personal'),
    ('picture_url', 'Imagen (URL)'),
    ('public_data', 'Datos públicos'),
    ('account_role', 'Rol en la cuenta'),
    ('hierarchy_level', 'Nivel jerárquico'),
    ('permission', 'Permiso'),
    ('invited_by', 'Invitado por'),
    ('invite_token', 'Token de invitación'),
    ('sent_at', 'Enviada el'),
    ('last_send_attempt_at', 'Último intento de envío'),
    ('resend_count', 'Reenvíos'),
    -- Facturación
    ('provider', 'Proveedor'),
    ('customer_id', 'ID de cliente en el proveedor'),
    ('billing_customer_id', 'Cliente de facturación'),
    ('billing_provider', 'Proveedor de pagos'),
    ('subscription_id', 'Suscripción'),
    ('order_id', 'Pedido'),
    ('product_id', 'Producto'),
    ('variant_id', 'Variante'),
    ('price_amount', 'Precio'),
    ('quantity', 'Cantidad'),
    ('total_amount', 'Importe total'),
    ('currency', 'Moneda'),
    ('active', 'Activa'),
    ('interval', 'Intervalo'),
    ('interval_count', 'Número de intervalos'),
    ('cancel_at_period_end', 'Cancelar al final del periodo'),
    ('period_starts_at', 'Inicio del periodo'),
    ('period_ends_at', 'Fin del periodo'),
    ('trial_starts_at', 'Inicio de la prueba'),
    ('trial_ends_at', 'Fin de la prueba'),
    -- Configuración
    ('enable_team_accounts', 'Cuentas de equipo activadas'),
    ('enable_account_billing', 'Facturación de cuentas personales activada'),
    ('enable_team_account_billing', 'Facturación de equipos activada'),
    -- Notificaciones
    ('body', 'Mensaje'),
    ('link', 'Enlace'),
    ('channel', 'Canal'),
    ('dismissed', 'Descartada'),
    -- Códigos de un solo uso
    ('client_token', 'Token del cliente'),
    ('nonce', 'Código'),
    ('purpose', 'Finalidad'),
    ('used_at', 'Usado el'),
    ('revoked', 'Revocado'),
    ('revoked_reason', 'Motivo de la revocación'),
    ('verification_attempts', 'Intentos de verificación'),
    ('last_verification_at', 'Última verificación'),
    ('last_verification_ip', 'IP de la última verificación'),
    ('last_verification_user_agent', 'Navegador de la última verificación'),
    ('scopes', 'Ámbitos'),
    -- Usuarios de Auth
    ('instance_id', 'Instancia'),
    ('aud', 'Audiencia'),
    ('encrypted_password', 'Contraseña cifrada'),
    ('email_confirmed_at', 'Correo confirmado el'),
    ('invited_at', 'Invitado el'),
    ('confirmation_token', 'Token de confirmación'),
    ('confirmation_sent_at', 'Confirmación enviada el'),
    ('recovery_token', 'Token de recuperación'),
    ('recovery_sent_at', 'Recuperación enviada el'),
    ('email_change_token_new', 'Token del correo nuevo'),
    ('email_change', 'Cambio de correo'),
    ('email_change_sent_at', 'Cambio de correo enviado el'),
    ('email_change_token_current', 'Token del correo actual'),
    ('email_change_confirm_status', 'Estado del cambio de correo'),
    ('last_sign_in_at', 'Último acceso'),
    ('raw_app_meta_data', 'Metadatos de la aplicación'),
    ('raw_user_meta_data', 'Metadatos del usuario'),
    ('is_super_admin', 'Super-admin de Auth'),
    ('phone', 'Teléfono'),
    ('phone_confirmed_at', 'Teléfono confirmado el'),
    ('phone_change', 'Cambio de teléfono'),
    ('phone_change_token', 'Token del cambio de teléfono'),
    ('phone_change_sent_at', 'Cambio de teléfono enviado el'),
    ('confirmed_at', 'Confirmado el'),
    ('banned_until', 'Bloqueado hasta'),
    ('reauthentication_token', 'Token de reautenticación'),
    ('reauthentication_sent_at', 'Reautenticación enviada el'),
    ('is_sso_user', 'Usuario SSO'),
    ('deleted_at', 'Borrado el'),
    ('is_anonymous', 'Anónimo');

-- Por cada tabla, se reconstruye `columns_config` cambiando solo el
-- `display_name` de las columnas que conservan el nombre generado y tienen
-- traducción en el diccionario; el resto de la configuración de la columna
-- (visibilidad, formato, orden…) se mantiene intacta.
update cms.table_metadata as meta
set columns_config = (
    select jsonb_object_agg(
        col.key,
        case
            when names.display_name is not null
                and (col.value ->> 'display_name') is not distinct from cms.generate_display_name(col.key)
            then col.value || jsonb_build_object('display_name', names.display_name)
            else col.value
        end
    )
    from jsonb_each(meta.columns_config) as col (key, value)
    left join cms_column_names as names on names.column_name = col.key
)
where meta.columns_config is not null
  and meta.columns_config <> '{}'::jsonb
  and (meta.schema_name, meta.table_name) in (
      ('public', 'accounts'), ('public', 'accounts_memberships'),
      ('public', 'invitations'), ('public', 'roles'),
      ('public', 'role_permissions'), ('public', 'user_active_account'),
      ('public', 'billing_customers'), ('public', 'subscriptions'),
      ('public', 'subscription_items'), ('public', 'orders'),
      ('public', 'order_items'), ('public', 'notifications'),
      ('public', 'config'), ('public', 'nonces'), ('auth', 'users')
  );
