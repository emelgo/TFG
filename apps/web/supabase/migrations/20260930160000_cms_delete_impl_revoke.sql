/*
 * Corrección de seguridad (PymeKit, F2.7a; BITACORA B-45).
 *
 * `cms._delete_record_impl` concatena `p_where_clauses` en la sentencia sin
 * validarlas y se ejecuta como SECURITY DEFINER con RLS desactivado. En la
 * F2.1 se concedió su EXECUTE a `authenticated` para que `delete_record`
 * (SECURITY INVOKER) funcionara, lo que permitía a cualquier miembro del
 * personal con permiso de borrado en una tabla leer cualquier dato de la BD
 * a través del texto de error. `delete_record` pasa a SECURITY DEFINER y el
 * permiso sobre la función interna se revoca.
 */

-- [TFG] RNF-02 · Corrección de PymeKit (BITACORA B-45): pasa a SECURITY
-- DEFINER, igual que `update_record`, para que `authenticated` no necesite
-- ejecutar directamente `_delete_record_impl`, que acepta cláusulas WHERE en
-- crudo. La función interna comprueba igualmente acceso y permisos.
create or replace function cms.delete_record (p_schema text, p_table text, p_id text) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
BEGIN
    RETURN cms._delete_record_impl(
            p_schema,
            p_table,
            ARRAY [format('id = %L', p_id)]
           );
END;
$$ LANGUAGE plpgsql;

grant execute on function cms.delete_record (text, text, text) to authenticated;

revoke execute on function cms._delete_record_impl (text, text, text[]) from public, anon, authenticated;
