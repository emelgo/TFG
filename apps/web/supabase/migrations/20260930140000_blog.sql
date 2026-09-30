/*
 * F2.6b · Blog en la base de datos gestionado desde el CMS (ADR-017).
 *
 * Generada con `supabase db diff` a partir de `schemas/19-blog.sql` y
 * `schemas/45-cms-sync-managed-tables.sql`, y completada a mano con lo que
 * la herramienta no genera (bitácora B-35):
 *
 *  - los `revoke all ... from anon, authenticated, service_role` de cada
 *    tabla (los valores por defecto de Supabase conceden TRUNCATE, que
 *    ignora RLS);
 *  - el `grant select` POR COLUMNAS de `blog_posts` a `anon`/`authenticated`
 *    (sin `created_by`, `updated_by` ni `author_id`);
 *  - la apertura mínima del esquema `public` a `anon` (`usage`), precedida de
 *    la retirada de cualquier privilegio residual de `anon` sobre las tablas,
 *    vistas y secuencias existentes;
 *  - los `comment on`, que tampoco entran en el diff.
 *
 * Se han quitado del diff las cinco funciones del CMS que solo difieren en
 * comentarios (deriva conocida, sin cambio de comportamiento).
 *
 * Incluye la corrección de `cms.sync_managed_tables`: cada sincronización
 * duplicaba las relaciones de la tabla; ahora es idempotente y conserva las
 * relaciones virtuales (`is_virtual`).
 *
 * [TFG] RF-01 · RF-09 · RNF-02 · ADR-017.
 */

-- Apertura mínima del esquema `public` a `anon` (ver 19-blog.sql): primero
-- se cierra todo lo que ya existe y después se concede `usage`.
revoke all privileges on all tables in schema public from anon;

revoke all privileges on all sequences in schema public from anon;

grant usage on schema public to anon;

create type "public"."blog_post_status" as enum ('draft', 'published', 'archived');


  create table "public"."blog_categories" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "name" character varying(100) not null,
    "slug" character varying(100) not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."blog_categories" enable row level security;


  create table "public"."blog_post_tags" (
    "post_id" uuid not null,
    "tag_id" uuid not null
      );


alter table "public"."blog_post_tags" enable row level security;


  create table "public"."blog_posts" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "slug" character varying(200) not null,
    "title" character varying(200) not null,
    "excerpt" character varying(500),
    "content" text not null default ''::text,
    "cover_image_url" character varying(2048),
    "status" public.blog_post_status not null default 'draft'::public.blog_post_status,
    "published_at" timestamp with time zone,
    "author_id" uuid,
    "category_id" uuid,
    "seo_title" character varying(200),
    "seo_description" character varying(300),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."blog_posts" enable row level security;


  create table "public"."blog_tags" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "name" character varying(100) not null,
    "slug" character varying(100) not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."blog_tags" enable row level security;

CREATE UNIQUE INDEX blog_categories_pkey ON public.blog_categories USING btree (id);

CREATE UNIQUE INDEX blog_categories_slug_key ON public.blog_categories USING btree (slug);

CREATE UNIQUE INDEX blog_post_tags_pkey ON public.blog_post_tags USING btree (post_id, tag_id);

CREATE UNIQUE INDEX blog_posts_pkey ON public.blog_posts USING btree (id);

CREATE UNIQUE INDEX blog_posts_slug_key ON public.blog_posts USING btree (slug);

CREATE UNIQUE INDEX blog_tags_pkey ON public.blog_tags USING btree (id);

CREATE UNIQUE INDEX blog_tags_slug_key ON public.blog_tags USING btree (slug);

CREATE INDEX ix_blog_post_tags_tag_id ON public.blog_post_tags USING btree (tag_id);

CREATE INDEX ix_blog_posts_author_id ON public.blog_posts USING btree (author_id);

CREATE INDEX ix_blog_posts_category_id ON public.blog_posts USING btree (category_id);

CREATE INDEX ix_blog_posts_status_published_at ON public.blog_posts USING btree (status, published_at DESC);

alter table "public"."blog_categories" add constraint "blog_categories_pkey" PRIMARY KEY using index "blog_categories_pkey";

alter table "public"."blog_post_tags" add constraint "blog_post_tags_pkey" PRIMARY KEY using index "blog_post_tags_pkey";

alter table "public"."blog_posts" add constraint "blog_posts_pkey" PRIMARY KEY using index "blog_posts_pkey";

alter table "public"."blog_tags" add constraint "blog_tags_pkey" PRIMARY KEY using index "blog_tags_pkey";

alter table "public"."blog_categories" add constraint "blog_categories_name_not_blank" CHECK ((length(TRIM(BOTH FROM name)) > 0)) not valid;

alter table "public"."blog_categories" validate constraint "blog_categories_name_not_blank";

alter table "public"."blog_categories" add constraint "blog_categories_slug_format" CHECK (((slug)::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)) not valid;

alter table "public"."blog_categories" validate constraint "blog_categories_slug_format";

alter table "public"."blog_categories" add constraint "blog_categories_slug_key" UNIQUE using index "blog_categories_slug_key";

alter table "public"."blog_post_tags" add constraint "blog_post_tags_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.blog_posts(id) ON DELETE CASCADE not valid;

alter table "public"."blog_post_tags" validate constraint "blog_post_tags_post_id_fkey";

alter table "public"."blog_post_tags" add constraint "blog_post_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES public.blog_tags(id) ON DELETE CASCADE not valid;

alter table "public"."blog_post_tags" validate constraint "blog_post_tags_tag_id_fkey";

alter table "public"."blog_posts" add constraint "blog_posts_author_id_fkey" FOREIGN KEY (author_id) REFERENCES public.accounts(id) ON DELETE SET NULL not valid;

alter table "public"."blog_posts" validate constraint "blog_posts_author_id_fkey";

alter table "public"."blog_posts" add constraint "blog_posts_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.blog_categories(id) ON DELETE SET NULL not valid;

alter table "public"."blog_posts" validate constraint "blog_posts_category_id_fkey";

alter table "public"."blog_posts" add constraint "blog_posts_content_length" CHECK ((length(content) <= 200000)) not valid;

alter table "public"."blog_posts" validate constraint "blog_posts_content_length";

alter table "public"."blog_posts" add constraint "blog_posts_cover_image_https" CHECK (((cover_image_url IS NULL) OR ((cover_image_url)::text ~ '^https://[^\s]+$'::text))) not valid;

alter table "public"."blog_posts" validate constraint "blog_posts_cover_image_https";

alter table "public"."blog_posts" add constraint "blog_posts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."blog_posts" validate constraint "blog_posts_created_by_fkey";

alter table "public"."blog_posts" add constraint "blog_posts_slug_format" CHECK (((slug)::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)) not valid;

alter table "public"."blog_posts" validate constraint "blog_posts_slug_format";

alter table "public"."blog_posts" add constraint "blog_posts_slug_key" UNIQUE using index "blog_posts_slug_key";

alter table "public"."blog_posts" add constraint "blog_posts_title_not_blank" CHECK ((length(TRIM(BOTH FROM title)) > 0)) not valid;

alter table "public"."blog_posts" validate constraint "blog_posts_title_not_blank";

alter table "public"."blog_posts" add constraint "blog_posts_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."blog_posts" validate constraint "blog_posts_updated_by_fkey";

alter table "public"."blog_tags" add constraint "blog_tags_name_not_blank" CHECK ((length(TRIM(BOTH FROM name)) > 0)) not valid;

alter table "public"."blog_tags" validate constraint "blog_tags_name_not_blank";

alter table "public"."blog_tags" add constraint "blog_tags_slug_format" CHECK (((slug)::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)) not valid;

alter table "public"."blog_tags" validate constraint "blog_tags_slug_format";

alter table "public"."blog_tags" add constraint "blog_tags_slug_key" UNIQUE using index "blog_tags_slug_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION kit.set_blog_post_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION cms.sync_managed_tables(p_schema_name text DEFAULT 'public'::text, p_table_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_table_record       RECORD;
    v_col_record         RECORD;
    v_rel_record         RECORD;
    v_key_record         RECORD; -- For primary key detection
    v_uniq_record        RECORD; -- For unique constraint detection
    v_columns            JSONB;
    v_is_primary_key     BOOLEAN;
    v_relations          JSONB;
    v_existing           JSONB;
    v_col_config         JSONB;
    v_relation           JSONB;
    v_existing_rel       JSONB;
    v_is_enum            BOOLEAN;
    v_enum_type          TEXT;
    v_enum_values        JSONB;
    v_primary_keys       JSONB; -- To store primary key info
    v_unique_constraints JSONB; -- To store unique constraints
    v_table_config       JSONB; -- To store table-level metadata
    i                    INTEGER;
    v_relation_idx       TEXT;
    v_inverse_relations  JSONB;
    v_existing_relations JSONB; -- relations_config guardado (para conservar ajustes)
BEGIN
    -- Sanitize inputs for security
    p_schema_name := cms.sanitize_identifier(p_schema_name);

    IF p_table_name IS NOT NULL THEN
        p_table_name := cms.sanitize_identifier(p_table_name);
    END IF;

    -- Note: We don't delete existing metadata here because we want to preserve
    -- custom values like display_name, description, etc. The INSERT ... ON CONFLICT
    -- logic below will handle merging new schema data with existing custom values.

    -- Build the query to get tables based on parameters
    FOR v_table_record IN
        EXECUTE format(
                'SELECT table_schema, table_name
             FROM information_schema.tables
             WHERE table_schema = %L
               AND table_type = ''BASE TABLE''
               %s
             ORDER BY table_name',
                p_schema_name,
                CASE
                    WHEN p_table_name IS NOT NULL
                        THEN format('AND table_name = %L', p_table_name)
                    ELSE ''
                    END
                )
        LOOP
            -- Build columns config JSONB
            v_columns := '{}'::jsonb;
            v_primary_keys := '[]'::jsonb;
            v_unique_constraints := '[]'::jsonb;
            v_table_config := '{}'::jsonb;
            v_relations := '[]'::jsonb;
            -- Initialize v_relations

            -- Get existing columns_config if any
            SELECT columns_config, ui_config, relations_config
            INTO v_existing, v_table_config, v_existing_relations
            FROM cms.table_metadata
            WHERE schema_name = v_table_record.table_schema
              AND table_name = v_table_record.table_name;

            -- Initialize configs if null
            IF v_table_config IS NULL THEN
                v_table_config := '{}'::jsonb;
            END IF;

            -- [TFG] RF-09 · Corrección de PymeKit (F2.6b): la versión heredada
            -- partía de las relaciones ya guardadas y les AÑADÍA las del
            -- catálogo, así que cada sincronización duplicaba todas las
            -- relaciones de la tabla. Ahora la lista se reconstruye desde el
            -- catálogo y las guardadas solo se usan para conservar sus ajustes
            -- (`inline_config`, `display_fields`…) y las relaciones virtuales.
            IF v_existing_relations IS NULL OR jsonb_typeof(v_existing_relations) <> 'array' THEN
                v_existing_relations := '[]'::jsonb;
            END IF;

            v_relations := '[]'::jsonb;

            -- 1. IDENTIFY PRIMARY KEYS
            -- Query to find primary key columns
            FOR v_key_record IN
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                         JOIN information_schema.key_column_usage kcu
                              ON tc.constraint_name = kcu.constraint_name
                WHERE tc.table_schema = v_table_record.table_schema
                  AND tc.table_name = v_table_record.table_name
                  AND tc.constraint_type = 'PRIMARY KEY'
                ORDER BY kcu.ordinal_position
                LOOP
                    -- Add to primary keys array
                    v_primary_keys := v_primary_keys || jsonb_build_object(
                            'column_name', v_key_record.column_name
                                                        );
                END LOOP;

            -- 2. IDENTIFY UNIQUE CONSTRAINTS
            FOR v_uniq_record IN
                SELECT tc.constraint_name,
                       jsonb_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns
                FROM information_schema.table_constraints tc
                         JOIN information_schema.key_column_usage kcu
                              ON tc.constraint_name = kcu.constraint_name
                WHERE tc.table_schema = v_table_record.table_schema
                  AND tc.table_name = v_table_record.table_name
                  AND tc.constraint_type = 'UNIQUE'
                GROUP BY tc.constraint_name
                LOOP
                    -- Add to unique constraints array
                    v_unique_constraints := v_unique_constraints || jsonb_build_object(
                            'constraint_name', v_uniq_record.constraint_name,
                            'columns', v_uniq_record.columns
                                                                    );
                END LOOP;

            -- Update table_config with primary key and unique constraint information
            v_table_config := jsonb_set(
                    v_table_config,
                    ARRAY ['primary_keys'],
                    v_primary_keys
                              );

            v_table_config := jsonb_set(
                    v_table_config,
                    ARRAY ['unique_constraints'],
                    v_unique_constraints
                              );

            -- Process columns
            FOR v_col_record IN
                SELECT column_name,
                       data_type,
                       character_maximum_length,
                       column_default,
                       is_nullable,
                       ordinal_position,
                       udt_name,
                       udt_schema
                FROM information_schema.columns
                WHERE table_schema = v_table_record.table_schema
                  AND table_name = v_table_record.table_name
                ORDER BY ordinal_position
                LOOP
                    -- Check if this column is a primary key
                    v_is_primary_key := (SELECT EXISTS (SELECT 1
                                                        FROM jsonb_array_elements(v_primary_keys)
                                                        WHERE value ->> 'column_name' = v_col_record.column_name));

                    -- Check if column type is an enum
                    v_is_enum := FALSE;
                    IF v_col_record.data_type = 'USER-DEFINED' THEN
                        -- Check if the UDT is an enum
                        SELECT EXISTS (SELECT 1
                                       FROM pg_type t
                                                JOIN pg_enum e ON t.oid = e.enumtypid
                                       WHERE t.typname = v_col_record.udt_name)
                        INTO v_is_enum;

                        IF v_is_enum THEN
                            v_enum_type := v_col_record.udt_name;

                            -- Get enum values
                            SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
                            FROM pg_enum e
                                     JOIN pg_type t ON e.enumtypid = t.oid
                            WHERE t.typname = v_enum_type
                            INTO v_enum_values;
                        END IF;
                    END IF;

                    v_col_config := jsonb_build_object(
                            'name', v_col_record.column_name,
                            'display_name', cms.generate_display_name(v_col_record.column_name),
                            'description', '',
                            'ordering', v_col_record.ordinal_position,
                            'is_required', v_col_record.is_nullable = 'NO',
                            'is_visible_in_table', true,
                            'is_visible_in_detail', true,
                            'is_filterable', true,
                            'is_searchable',
                            cms.is_textual_data_type(v_col_record.data_type, v_col_record.udt_name,
                                                          v_col_record.udt_schema),
                            'is_sortable', true,
                            'is_editable', NOT (v_is_primary_key OR v_col_record.column_name = 'id' OR
                                                v_col_record.column_name LIKE '%\_at'),
                            'is_primary_key', v_is_primary_key,
                            'default_value', v_col_record.column_default,
                            'ui_config', jsonb_build_object(
                                    'data_type', v_col_record.data_type,
                                    'max_length', v_col_record.character_maximum_length,
                                    'is_enum', v_is_enum,
                                    'enum_type', CASE WHEN v_is_enum THEN v_enum_type ELSE NULL END,
                                    'enum_values', CASE WHEN v_is_enum THEN v_enum_values ELSE NULL END
                                         )
                                    );

                    -- Preserve existing custom settings if any
                    IF v_existing IS NOT NULL AND v_existing ? v_col_record.column_name THEN
                        v_col_config := v_col_config || v_existing -> v_col_record.column_name;
                    END IF;

                    -- Add to columns collection
                    v_columns := v_columns || jsonb_build_object(v_col_record.column_name, v_col_config);
                END LOOP;

            -- 3. PROCESS FOREIGN KEY RELATIONSHIPS
            -- Use system catalogs instead of information_schema for cross-schema compatibility
            FOR v_rel_record IN
                SELECT 
                    a.attname as source_column,
                    fn.nspname as target_schema,
                    ft.relname as target_table,
                    fa.attname as target_column
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_namespace n ON t.relnamespace = n.oid
                JOIN pg_class ft ON c.confrelid = ft.oid
                JOIN pg_namespace fn ON ft.relnamespace = fn.oid
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
                JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = ANY(c.confkey)
                WHERE n.nspname = v_table_record.table_schema
                  AND t.relname = v_table_record.table_name
                  AND c.contype = 'f'
                LOOP
                    -- Una relación virtual guardada sobre la misma columna
                    -- sustituye a la clave foránea real (p. ej. `user_id` →
                    -- `public.accounts` en lugar de `auth.users`, un esquema
                    -- que el CMS no puede leer): no se vuelve a añadir.
                    IF EXISTS (SELECT 1
                               FROM jsonb_array_elements(v_existing_relations) AS rel(value)
                               WHERE COALESCE((rel.value ->> 'is_virtual')::boolean, false)
                                 AND rel.value ->> 'source_column' = v_rel_record.source_column
                                 AND COALESCE(rel.value ->> 'relation_type', 'many_to_one') IN ('many_to_one', 'one_to_one')) THEN
                        CONTINUE;
                    END IF;

                    -- Create relation object
                    v_relation := jsonb_build_object(
                            'source_column', v_rel_record.source_column,
                            'target_schema', v_rel_record.target_schema,
                            'target_table', v_rel_record.target_table,
                            'target_column', v_rel_record.target_column,
                            'relation_type', 'many_to_one',
                            'display_fields', '[]'::jsonb
                                  );

                    -- Check if relation already exists and preserve custom settings
                    v_existing_rel := NULL;
                    FOR i IN 0..jsonb_array_length(v_existing_relations) - 1
                        LOOP
                            IF (v_existing_relations -> i ->> 'source_column' = v_rel_record.source_column AND
                                v_existing_relations -> i ->> 'target_schema' = v_rel_record.target_schema AND
                                v_existing_relations -> i ->> 'target_table' = v_rel_record.target_table AND
                                COALESCE(v_existing_relations -> i ->> 'relation_type', 'many_to_one') = 'many_to_one' AND
                                NOT COALESCE((v_existing_relations -> i ->> 'is_virtual')::boolean, false)) THEN
                                v_existing_rel := v_existing_relations -> i;
                                EXIT;
                            END IF;
                        END LOOP;

                    -- Merge with existing relation config if found
                    IF v_existing_rel IS NOT NULL THEN
                        v_relation := v_relation || v_existing_rel;
                    END IF;

                    -- Convert array index to text for use in jsonb_set
                    v_relation_idx := jsonb_array_length(v_relations)::text;

                    -- Add to relations array (FIXED)
                    v_relations := jsonb_set(
                            v_relations,
                            ARRAY [v_relation_idx],
                            v_relation
                                   );
                END LOOP;

            -- 4. PROCESS INCOMING FOREIGN KEY RELATIONSHIPS (one-to-many)
            -- Find foreign keys from other tables that reference this table
            -- Use system catalogs for cross-schema compatibility
            FOR v_rel_record IN
                SELECT 
                    sn.nspname as source_schema,
                    st.relname as source_table,
                    sa.attname as source_column,
                    ta.attname as target_column
                FROM pg_constraint c
                JOIN pg_class st ON c.conrelid = st.oid
                JOIN pg_namespace sn ON st.relnamespace = sn.oid
                JOIN pg_class tt ON c.confrelid = tt.oid
                JOIN pg_namespace tn ON tt.relnamespace = tn.oid
                JOIN pg_attribute sa ON sa.attrelid = c.conrelid AND sa.attnum = ANY(c.conkey)
                JOIN pg_attribute ta ON ta.attrelid = c.confrelid AND ta.attnum = ANY(c.confkey)
                WHERE tn.nspname = v_table_record.table_schema
                  AND tt.relname = v_table_record.table_name
                  AND c.contype = 'f'
                  -- Avoid duplicating relationships already found in the outgoing scan
                  AND NOT (sn.nspname = v_table_record.table_schema 
                          AND st.relname = v_table_record.table_name)
                LOOP
                    -- Create incoming relation object (one-to-many)
                    v_relation := jsonb_build_object(
                            'source_column', v_rel_record.target_column,  -- This table's column
                            'target_schema', v_rel_record.source_schema,  -- The referencing schema
                            'target_table', v_rel_record.source_table,    -- The referencing table
                            'target_column', v_rel_record.source_column,  -- The referencing column
                            'relation_type', 'one_to_many',               -- Inverse relationship type
                            'display_fields', '[]'::jsonb
                                  );

                    -- Check if relation already exists and preserve custom settings
                    v_existing_rel := NULL;
                    FOR i IN 0..jsonb_array_length(v_existing_relations) - 1
                        LOOP
                            IF (v_existing_relations -> i ->> 'source_column' = v_rel_record.target_column AND
                                v_existing_relations -> i ->> 'target_table' = v_rel_record.source_table AND
                                v_existing_relations -> i ->> 'target_schema' = v_rel_record.source_schema AND
                                v_existing_relations -> i ->> 'target_column' = v_rel_record.source_column AND
                                v_existing_relations -> i ->> 'relation_type' = 'one_to_many') THEN
                                v_existing_rel := v_existing_relations -> i;
                                EXIT;
                            END IF;
                        END LOOP;

                    -- Merge with existing relation config if found
                    IF v_existing_rel IS NOT NULL THEN
                        v_relation := v_relation || v_existing_rel;
                    END IF;

                    -- Convert array index to text for use in jsonb_set
                    v_relation_idx := jsonb_array_length(v_relations)::text;

                    -- Add to relations array
                    v_relations := jsonb_set(
                            v_relations,
                            ARRAY [v_relation_idx],
                            v_relation
                                   );
                END LOOP;

            -- Las relaciones virtuales (`is_virtual = true`) no salen del
            -- catálogo: las define quien administra el CMS en el metadato y se
            -- conservan tal cual en cada sincronización.
            SELECT v_relations || COALESCE(jsonb_agg(rel.value), '[]'::jsonb)
            INTO v_relations
            FROM jsonb_array_elements(v_existing_relations) AS rel(value)
            WHERE COALESCE((rel.value ->> 'is_virtual')::boolean, false);

            -- Insert or update table_metadata
            INSERT INTO cms.table_metadata (schema_name,
                                                 table_name,
                                                 display_name,
                                                 columns_config,
                                                 relations_config,
                                                 ui_config)
            VALUES (v_table_record.table_schema,
                    v_table_record.table_name,
                    cms.generate_display_name(v_table_record.table_name),
                    v_columns,
                    v_relations,
                    v_table_config)
            ON CONFLICT (schema_name, table_name) DO UPDATE
                SET
                    -- Preserve existing custom values, fall back to new generated values
                    display_name     = COALESCE(table_metadata.display_name, EXCLUDED.display_name),
                    description      = COALESCE(table_metadata.description, EXCLUDED.description),
                    is_visible       = COALESCE(table_metadata.is_visible, EXCLUDED.is_visible),
                    ordering         = COALESCE(table_metadata.ordering, EXCLUDED.ordering),
                    is_searchable    = COALESCE(table_metadata.is_searchable, EXCLUDED.is_searchable),

                    -- Always update schema-derived configs with new scan data
                    keys_config      = EXCLUDED.keys_config,
                    relations_config = EXCLUDED.relations_config,
                    ui_config        = (
                        -- Merge ui_config: preserve existing custom fields while updating schema-derived fields
                        -- Use EXCLUDED || existing to let existing custom fields override schema defaults
                        CASE
                            WHEN table_metadata.ui_config IS NULL THEN EXCLUDED.ui_config
                            ELSE EXCLUDED.ui_config || table_metadata.ui_config
                            END
                        ),
                    columns_config   = (SELECT jsonb_object_agg(
                                                       column_key,
                                                       CASE
                                                           -- If column exists in both old and new config, merge them
                                                           WHEN table_metadata.columns_config ? column_key THEN
                                                               -- Start with new schema-derived data
                                                               EXCLUDED.columns_config -> column_key ||
                                                                   -- Overlay preserved custom fields from existing config
                                                               jsonb_build_object(
                                                                       'display_name', COALESCE(
                                                                       (table_metadata.columns_config -> column_key ->> 'display_name'),
                                                                       (EXCLUDED.columns_config -> column_key ->> 'display_name')
                                                                                       ),
                                                                       'description', COALESCE(
                                                                               (table_metadata.columns_config -> column_key ->> 'description'),
                                                                               (EXCLUDED.columns_config -> column_key ->> 'description')
                                                                                      ),
                                                                       'is_visible_in_table', COALESCE(
                                                                               (table_metadata.columns_config -> column_key ->> 'is_visible_in_table')::boolean,
                                                                               (EXCLUDED.columns_config -> column_key ->> 'is_visible_in_table')::boolean
                                                                                              ),
                                                                       'is_visible_in_detail', COALESCE(
                                                                               (table_metadata.columns_config -> column_key ->> 'is_visible_in_detail')::boolean,
                                                                               (EXCLUDED.columns_config -> column_key ->> 'is_visible_in_detail')::boolean
                                                                                               ),
                                                                       'is_filterable', COALESCE(
                                                                               (table_metadata.columns_config -> column_key ->> 'is_filterable')::boolean,
                                                                               (EXCLUDED.columns_config -> column_key ->> 'is_filterable')::boolean
                                                                                        ),
                                                                       'is_sortable', COALESCE(
                                                                               (table_metadata.columns_config -> column_key ->> 'is_sortable')::boolean,
                                                                               (EXCLUDED.columns_config -> column_key ->> 'is_sortable')::boolean
                                                                                      ),
                                                                       'is_editable', COALESCE(
                                                                               (table_metadata.columns_config -> column_key ->> 'is_editable')::boolean,
                                                                               (EXCLUDED.columns_config -> column_key ->> 'is_editable')::boolean
                                                                                      )
                                                               )
                                                           -- If column only exists in new config, use it as-is
                                                           ELSE EXCLUDED.columns_config -> column_key
                                                           END
                                               )
                                        FROM jsonb_object_keys(EXCLUDED.columns_config) AS column_key),

                    -- Always update timestamp
                    updated_at       = NOW();
        END LOOP;
END;
$function$
;

-- Privilegios escritos a mano (migra no genera los `revoke` por tabla ni los
-- `grant` por columna, B-35). Se revoca todo antes de los `grant` de abajo.
revoke all on public.blog_categories from anon, authenticated, service_role;

revoke all on public.blog_tags from anon, authenticated, service_role;

revoke all on public.blog_posts from anon, authenticated, service_role;

revoke all on public.blog_post_tags from anon, authenticated, service_role;

-- [TFG] RNF-02 · Lectura pública de `blog_posts` solo por columnas: sin los
-- identificadores de usuario (`created_by`, `updated_by`, `author_id`).
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

grant select on table "public"."blog_categories" to "anon";

grant select on table "public"."blog_categories" to "authenticated";

grant delete on table "public"."blog_categories" to "service_role";

grant insert on table "public"."blog_categories" to "service_role";

grant select on table "public"."blog_categories" to "service_role";

grant update on table "public"."blog_categories" to "service_role";

grant select on table "public"."blog_post_tags" to "anon";

grant select on table "public"."blog_post_tags" to "authenticated";

grant delete on table "public"."blog_post_tags" to "service_role";

grant insert on table "public"."blog_post_tags" to "service_role";

grant select on table "public"."blog_post_tags" to "service_role";

grant update on table "public"."blog_post_tags" to "service_role";

grant delete on table "public"."blog_posts" to "service_role";

grant insert on table "public"."blog_posts" to "service_role";

grant select on table "public"."blog_posts" to "service_role";

grant update on table "public"."blog_posts" to "service_role";

grant select on table "public"."blog_tags" to "anon";

grant select on table "public"."blog_tags" to "authenticated";

grant delete on table "public"."blog_tags" to "service_role";

grant insert on table "public"."blog_tags" to "service_role";

grant select on table "public"."blog_tags" to "service_role";

grant update on table "public"."blog_tags" to "service_role";


  create policy "blog_categories_read"
  on "public"."blog_categories"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "blog_post_tags_read_published"
  on "public"."blog_post_tags"
  as permissive
  for select
  to anon, authenticated
using ((EXISTS ( SELECT 1
   FROM public.blog_posts post
  WHERE ((post.id = blog_post_tags.post_id) AND (post.status = 'published'::public.blog_post_status) AND (post.published_at <= now())))));



  create policy "blog_posts_read_published"
  on "public"."blog_posts"
  as permissive
  for select
  to anon, authenticated
using (((status = 'published'::public.blog_post_status) AND (published_at <= now())));



  create policy "blog_tags_read"
  on "public"."blog_tags"
  as permissive
  for select
  to anon, authenticated
using (true);


CREATE TRIGGER blog_categories_set_timestamps BEFORE INSERT OR UPDATE ON public.blog_categories FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamps();

CREATE TRIGGER blog_posts_set_defaults BEFORE INSERT OR UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION kit.set_blog_post_defaults();

CREATE TRIGGER blog_posts_set_timestamps BEFORE INSERT OR UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamps();

CREATE TRIGGER blog_posts_set_user_tracking BEFORE INSERT OR UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.trigger_set_user_tracking();

CREATE TRIGGER blog_tags_set_timestamps BEFORE INSERT OR UPDATE ON public.blog_tags FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamps();

-- Comentarios (no entran en el diff; se copian de 19-blog.sql)
comment on type public.blog_post_status is
  'Estado editorial de una entrada del blog: borrador, publicada o archivada';

comment on table public.blog_categories is 'Categorías de las entradas del blog';

comment on column public.blog_categories.name is 'Nombre visible de la categoría';

comment on column public.blog_categories.slug is
  'Identificador de la categoría en la URL (minúsculas, dígitos y guiones)';

comment on table public.blog_tags is 'Etiquetas de las entradas del blog';

comment on column public.blog_tags.name is 'Nombre visible de la etiqueta';

comment on column public.blog_tags.slug is
  'Identificador de la etiqueta en la URL (minúsculas, dígitos y guiones)';

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

comment on table public.blog_post_tags is
  'Etiquetas de cada entrada del blog (relación muchos a muchos)';

comment on column public.blog_post_tags.post_id is 'Entrada etiquetada';

comment on column public.blog_post_tags.tag_id is 'Etiqueta aplicada';
