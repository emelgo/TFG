/*
 * -------------------------------------------------------
 * Sección: Almacenamiento desde el CMS
 * Permite al personal gestionar ficheros de Supabase Storage desde el panel,
 * con permisos de datos de ámbito `storage` (bucket y patrón de ruta).
 * -------------------------------------------------------
 */

-- Función `cms.get_column_storage_config`: devuelve la configuración de
-- almacenamiento de una columna (bucket y ruta donde se suben sus ficheros),
-- guardada en los metadatos de la tabla.
create or replace function cms.get_column_storage_config (p_schema text, p_table text, p_column text) RETURNS jsonb
set
  search_path = '' as $$
DECLARE
    v_config jsonb;
BEGIN
    -- Validate inputs
    p_schema := cms.sanitize_identifier(p_schema);
    p_table := cms.sanitize_identifier(p_table);
    p_column := cms.sanitize_identifier(p_column);

    -- Check permissions
    IF NOT cms.has_data_permission('select'::cms.system_action, p_schema, p_table) THEN
        RAISE EXCEPTION 'Permission denied for accessing table metadata';
    END IF;

    SELECT tm.columns_config -> p_column -> 'ui_config' -> 'ui_data_type_config'
    INTO v_config
    FROM cms.table_metadata tm
    WHERE tm.schema_name = p_schema
      AND tm.table_name = p_table
      AND tm.columns_config -> p_column -> 'ui_config' ->> 'ui_data_type' IN ('file', 'image');

    RETURN COALESCE(v_config, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.get_column_storage_config to authenticated;

-- Políticas RLS de storage.objects para el CMS: una por operación, todas
-- delegando en cms.has_storage_permission. Son permisivas, así que se suman
-- (OR) a las del bucket de imágenes de cuentas (17-storage.sql); un usuario
-- de la web sin permisos del CMS no gana nada con ellas.
-- Política INSERT (subir ficheros).
create policy "cms_storage_upload" on storage.objects for INSERT to authenticated
with
  check (
    cms.has_storage_permission (bucket_id, 'insert'::cms.system_action, name)
  );

-- Política SELECT (leer o descargar).
create policy "cms_storage_select" on storage.objects for
select
  to authenticated using (
    cms.has_storage_permission (bucket_id, 'select'::cms.system_action, name)
  );

-- Política UPDATE (reemplazar o mover).
create policy "cms_storage_update" on storage.objects
for update
  to authenticated using (
    cms.has_storage_permission (bucket_id, 'update'::cms.system_action, name)
  );

-- Política DELETE (borrar).
create policy "cms_storage_delete" on storage.objects for DELETE to authenticated using (
  cms.has_storage_permission (bucket_id, 'delete'::cms.system_action, name)
);