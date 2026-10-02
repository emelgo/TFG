/*
 * -------------------------------------------------------
 * Permisos de ejecución de las funciones del CMS
 *
 * PymeKit elimina el EXECUTE implícito de PUBLIC sobre toda función nueva
 * (`alter default privileges revoke execute on functions from public`, en la
 * migración inicial). El esquema `cms` se diseñó contando con ese permiso
 * implícito para algunas funciones que invoca el propio usuario, de modo que
 * aquí se conceden de forma explícita y solo a `authenticated` (nunca a
 * `anon`, que además no tiene USAGE sobre el esquema `cms`).
 *
 * Cada `grant` se justifica junto a la función en el esquema declarativo
 * (24-cms-utils.sql, 34-cms-permissions-functions.sql, 46-cms-crud-functions.sql
 * y 47-cms-audit-logs.sql).
 *
 * [TFG] RNF-02 Seguridad: privilegio mínimo; ver ADR-012.
 * -------------------------------------------------------
 */

-- Se usa en las políticas RLS de permisos (WITH CHECK), que se evalúan con el
-- rol del usuario. El esquema declarativo ya lo concedía; la migración de
-- endurecimiento recreaba la función sin repetir el `grant`.
grant execute on function cms.can_grant_permission (uuid) to authenticated;

-- Funciones puras de formateo de literales y de clasificación de tipos.
grant execute on function cms.format_typed_value (jsonb, text, text, text) to authenticated;

grant execute on function cms.is_textual_data_type (text, text, text) to authenticated;

-- `delete_record` (SECURITY INVOKER) la llama con el rol del usuario; la
-- función comprueba el acceso al CMS y el permiso de borrado sobre la tabla.
grant execute on function cms._delete_record_impl (text, text, text[]) to authenticated;

-- Punto de entrada del explorador de datos; exige `has_data_permission`.
grant execute on function cms.query_table (text, text, jsonb, jsonb, jsonb) to authenticated;

-- Construye (sin ejecutar) la cláusula WHERE validando columnas y operadores.
grant execute on function cms.build_where_clause (text, text, jsonb) to authenticated;

-- SECURITY INVOKER: el `insert` en `cms.audit_logs` sigue sujeto a RLS.
grant execute on function cms.create_audit_log (text, text, text, text, jsonb, jsonb, cms.audit_log_severity, jsonb) to authenticated;
