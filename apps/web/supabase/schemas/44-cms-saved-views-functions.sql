
-- SECTION: INSERT SAVED VIEW
-- In this section, we define the insert saved view function. This function is used to insert a saved view and the roles that have access to it.
create or replace function cms.insert_saved_view (
  name varchar(255),
  description text,
  view_type varchar(50),
  config jsonb,
  schema_name varchar(64),
  table_name varchar(64),
  role_ids uuid[] default null
) RETURNS uuid
set
  search_path = '' as $$
DECLARE
    v_view_id    uuid;
    v_account_id uuid; -- Added declaration
    v_role_id    uuid;
BEGIN
    IF NOT cms.verify_admin_access() THEN
        RAISE EXCEPTION 'You do not have permission to insert views';
    END IF;

    -- Get current user's account ID
    v_account_id := cms.get_current_user_account_id();

    -- Insert the view
    INSERT INTO cms.saved_views (name, description, view_type, config, created_by, schema_name, table_name)
    VALUES (name, description, view_type, config, v_account_id, schema_name, table_name)
    RETURNING id INTO v_view_id;

    -- Insert the view role if provided
    IF role_ids IS NOT NULL THEN
        FOREACH v_role_id IN ARRAY role_ids
            LOOP
                INSERT INTO cms.saved_view_roles (view_id, role_id)
                VALUES (v_view_id, v_role_id);
            END LOOP;
    END IF;

    RETURN v_view_id; -- Return the created view ID
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.insert_saved_view to authenticated;

-- SECTION: GET USER VIEWS
-- In this section, we define the get user views function. This function is used to get the views that a user has access to.
create or replace function cms.get_user_views (
  p_schema_name text default null,
  p_table_name text default null
) RETURNS jsonb
set
  search_path = '' as $$
DECLARE
    v_account_id     UUID;
    v_result         jsonb;
    v_personal_views jsonb;
    v_team_views     jsonb;
    v_conditions     TEXT := 'TRUE';
BEGIN
    if not cms.verify_admin_access() then
        raise exception 'You do not have permission to view views';
    end if;

    -- Get current user's account ID
    v_account_id := cms.get_current_user_account_id();

    -- Build conditions
    IF p_schema_name IS NOT NULL THEN
        v_conditions := v_conditions || ' AND schema_name = ' || quote_literal(p_schema_name);
    END IF;

    IF p_table_name IS NOT NULL THEN
        v_conditions := v_conditions || ' AND table_name = ' || quote_literal(p_table_name);
    END IF;

    -- Get personal views (created by the user)
    EXECUTE format('
        SELECT COALESCE(jsonb_agg(to_jsonb(sv.*)), ''[]''::jsonb)
        FROM cms.saved_views sv
        WHERE sv.created_by = %L
        AND %s
    ', v_account_id, v_conditions) INTO v_personal_views;

    -- Get team views (shared with the user's roles)
    EXECUTE format('
        SELECT COALESCE(
            jsonb_agg(DISTINCT to_jsonb(sv.*)),
            ''[]''::jsonb
        )
        FROM cms.saved_views sv
        JOIN cms.saved_view_roles svr ON sv.id = svr.view_id
        JOIN cms.account_roles ar ON svr.role_id = ar.role_id
        WHERE ar.account_id = %L
        AND sv.created_by != %L
        AND %s
    ', v_account_id, v_account_id, v_conditions) INTO v_team_views;

    -- Combine into the requested format
    v_result := jsonb_build_object(
            'personal', COALESCE(v_personal_views, '[]'::jsonb),
            'team', COALESCE(v_team_views, '[]'::jsonb)
                );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.get_user_views to authenticated;