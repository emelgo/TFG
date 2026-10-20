/*
 * -------------------------------------------------------
 * Sección: Esquema del CMS y sus privilegios por defecto
 * Primer fichero del CMS (panel de administración en `/admin/cms`). Todo lo
 * que necesita el CMS para funcionar (cuentas de administración, roles,
 * permisos, auditoría, vistas guardadas...) vive en el esquema `cms`,
 * separado de `public`, para que la plataforma y la herramienta de
 * administración no se mezclen. Igual que en 00-privileges.sql, se parte de
 * "nadie puede nada" y cada objeto concede después lo que necesita.
 * -------------------------------------------------------
 */
-- Creación del esquema `cms`.
create schema if not exists cms;

-- USAGE sobre el esquema para usuarios autenticados: no da acceso a nada por
-- sí mismo; cada tabla y función tiene sus propios permisos y políticas.
grant usage on schema cms to authenticated;

-- Ninguna función nueva del esquema `cms` será ejecutable por anon ni por
-- authenticated salvo `grant` explícito.
alter default privileges in schema cms
revoke
execute on functions
from
  anon,
  authenticated;

-- Lo mismo para las tablas y secuencias que se creen en el futuro.
alter default privileges in SCHEMA cms
revoke all on TABLES
from
  anon,
  authenticated,
  public;

alter default privileges in SCHEMA cms
revoke all on SEQUENCES
from
  anon,
  authenticated,
  public;