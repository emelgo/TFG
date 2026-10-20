/*
 * Nombres en español de las columnas de `auth.users` en el CMS (F3c).
 *
 * `20261002130000_cms_spanish_display_names.sql` tradujo las columnas de las
 * tablas registradas en el CMS, pero en una base de datos recién creada
 * `auth.users` aún no estaba registrada en ese momento (lo hacía el *seed*).
 * Desde `20261002140000_cms_navigation_groups.sql` se registra en la propia
 * migración, así que aquí se le aplica el mismo diccionario. Como antes, solo
 * se cambian los nombres que siguen siendo los generados automáticamente.
 *
 * [TFG] RNF-08 · ADR-020.
 */
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
    left join (
        values
            ('id', 'ID'), ('email', 'Correo electrónico'), ('role', 'Rol'),
            ('created_at', 'Creado el'), ('updated_at', 'Actualizado el'),
            ('instance_id', 'Instancia'), ('aud', 'Audiencia'),
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
            ('is_anonymous', 'Anónimo')
    ) as names (column_name, display_name) on names.column_name = col.key
)
where meta.schema_name = 'auth'
  and meta.table_name = 'users'
  and meta.columns_config is not null
  and meta.columns_config <> '{}'::jsonb;
