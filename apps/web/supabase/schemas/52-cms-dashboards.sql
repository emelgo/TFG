-- ============================================
-- SECTION: CORE TABLES 
-- ============================================

CREATE TYPE cms.dashboard_permission_level AS ENUM ('owner', 'view', 'edit');

CREATE TYPE cms.dashboard_widget_type AS ENUM ('chart', 'metric', 'table');

CREATE TABLE IF NOT EXISTS cms.dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  -- SET NULL, not CASCADE: deleting a user must not destroy dashboards they
  -- created and shared with the organisation. Ownership falls back to the
  -- edit-share population in the RLS policies below.
  created_by UUID REFERENCES cms.accounts(id) ON DELETE SET NULL DEFAULT cms.get_current_user_account_id(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT dashboards_name_check CHECK (LENGTH(TRIM(name)) >= 3)
);

-- Dashboard widgets
CREATE TABLE IF NOT EXISTS cms.dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID REFERENCES cms.dashboards(id) ON DELETE CASCADE NOT NULL,
  widget_type cms.dashboard_widget_type NOT NULL,
  title VARCHAR(255) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  position JSONB NOT NULL,
  schema_name VARCHAR(64) NOT NULL,
  table_name VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  FOREIGN KEY (schema_name, table_name) 
    REFERENCES cms.table_metadata(schema_name, table_name) ON DELETE CASCADE,
  
  CONSTRAINT position_valid CHECK (
    position ? 'x' AND position ? 'y' AND 
    position ? 'w' AND position ? 'h' AND
    (position->'x')::numeric >= 0 AND 
    (position->'y')::numeric >= 0 AND
    (position->'w')::numeric > 0 AND 
    (position->'h')::numeric > 0
  )
);

-- Dashboard role shares - SIMPLE
CREATE TABLE IF NOT EXISTS cms.dashboard_role_shares (
  dashboard_id UUID REFERENCES cms.dashboards(id) ON DELETE CASCADE NOT NULL,
  role_id UUID REFERENCES cms.roles(id) ON DELETE CASCADE NOT NULL,
  permission_level cms.dashboard_permission_level NOT NULL DEFAULT 'view',
  granted_by UUID REFERENCES cms.accounts(id) NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (dashboard_id, role_id)
);

-- ============================================
-- SECTION: INDEXES
-- ============================================

CREATE INDEX idx_dashboards_created_by ON cms.dashboards(created_by);
CREATE INDEX idx_dashboard_widgets_dashboard ON cms.dashboard_widgets(dashboard_id);
CREATE INDEX idx_dashboard_role_shares_dashboard ON cms.dashboard_role_shares(dashboard_id);
CREATE INDEX idx_dashboard_role_shares_role ON cms.dashboard_role_shares(role_id);

-- ============================================
-- SECTION: RLS HELPER FUNCTIONS
-- ============================================

-- Check if user can access dashboard
CREATE OR REPLACE FUNCTION cms.can_access_dashboard(p_dashboard_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_user_id UUID;
BEGIN
  -- [TFG] RNF-02 · Corrección de PymeKit: sin acceso de administración
  -- vigente (claim, cuenta activa y MFA) no se accede a ningún panel, aunque
  -- siga existiendo la cuenta o una compartición antigua.
  IF NOT cms.verify_admin_access() THEN
    RETURN false;
  END IF;

  v_current_user_id := cms.get_current_user_account_id();
  
  RETURN EXISTS (
    SELECT 1 FROM cms.dashboards d
    WHERE d.id = p_dashboard_id
    AND (
      d.created_by = v_current_user_id
      OR EXISTS (
        SELECT 1 FROM cms.dashboard_role_shares drs
        JOIN cms.account_roles ar ON ar.role_id = drs.role_id
        WHERE drs.dashboard_id = d.id
        AND ar.account_id = v_current_user_id
      )
    )
  );
END;
$$;

-- Check if user can edit dashboard
CREATE OR REPLACE FUNCTION cms.can_edit_dashboard(p_dashboard_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_user_id UUID;
BEGIN
  -- [TFG] RNF-02 · Corrección de PymeKit: sin acceso de administración
  -- vigente (claim, cuenta activa y MFA) no se accede a ningún panel, aunque
  -- siga existiendo la cuenta o una compartición antigua.
  IF NOT cms.verify_admin_access() THEN
    RETURN false;
  END IF;

  v_current_user_id := cms.get_current_user_account_id();
  
  RETURN EXISTS (
    SELECT 1 FROM cms.dashboards d
    WHERE d.id = p_dashboard_id
    AND (
      d.created_by = v_current_user_id
      OR EXISTS (
        SELECT 1 FROM cms.dashboard_role_shares drs
        JOIN cms.account_roles ar ON ar.role_id = drs.role_id
        WHERE drs.dashboard_id = d.id
        AND ar.account_id = v_current_user_id
        AND drs.permission_level = ANY(ARRAY['edit', 'owner']::cms.dashboard_permission_level[])
      )
    )
  );
END;
$$;

-- ============================================
-- SECTION: RLS POLICIES (USING FUNCTIONS)
-- ============================================

ALTER TABLE cms.dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms.dashboard_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms.dashboard_role_shares ENABLE ROW LEVEL SECURITY;
-- FORCE, so the SECURITY DEFINER sharing functions (owned by the same role as
-- the table) are still subject to the manage_shares rank ceiling.
ALTER TABLE cms.dashboard_role_shares FORCE ROW LEVEL SECURITY;

-- Dashboards
CREATE POLICY select_dashboards ON cms.dashboards FOR SELECT
USING (cms.can_access_dashboard(id));

CREATE POLICY insert_dashboards ON cms.dashboards FOR INSERT
WITH CHECK (
  cms.verify_admin_access() AND
  created_by = cms.get_current_user_account_id()
);

CREATE POLICY update_dashboards ON cms.dashboards FOR UPDATE
USING (cms.can_edit_dashboard(id));

CREATE POLICY delete_dashboards ON cms.dashboards FOR DELETE
USING (
  created_by = cms.get_current_user_account_id()
  OR (created_by IS NULL AND cms.can_edit_dashboard(id))
);

-- Widgets
CREATE POLICY select_widgets ON cms.dashboard_widgets FOR SELECT
USING (cms.can_access_dashboard(dashboard_id));

CREATE POLICY insert_widgets ON cms.dashboard_widgets FOR INSERT
WITH CHECK (
  cms.can_edit_dashboard(dashboard_id)
  AND cms.has_data_permission(
    'select',
    schema_name,
    table_name
  )
);

-- [TFG] RF-11 · RNF-02 · Corrección de PymeKit (F2.8): la política heredada
-- no tenía WITH CHECK, así que quien podía editar el panel podía apuntar un
-- widget existente a una tabla que no puede leer (o moverlo a otro panel).
-- Ahora la fila resultante debe cumplir lo mismo que al crearla.
CREATE POLICY update_widgets ON cms.dashboard_widgets FOR UPDATE
USING (cms.can_edit_dashboard(dashboard_id))
WITH CHECK (
  cms.can_edit_dashboard(dashboard_id)
  AND cms.has_data_permission(
    'select',
    schema_name,
    table_name
  )
);

CREATE POLICY delete_widgets ON cms.dashboard_widgets FOR DELETE
USING (cms.can_edit_dashboard(dashboard_id));

-- Shares (only owner can manage, and only with roles of lower rank)
CREATE POLICY manage_shares ON cms.dashboard_role_shares FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM cms.dashboards d
    WHERE d.id = dashboard_role_shares.dashboard_id
    AND (
      d.created_by = cms.get_current_user_account_id()
      OR (d.created_by IS NULL AND cms.can_edit_dashboard(d.id))
    )
  )
)
WITH CHECK (
  -- Additional check for INSERT/UPDATE: ensure role hierarchy is respected
  EXISTS (
    SELECT 1 FROM cms.dashboards d
    WHERE d.id = dashboard_role_shares.dashboard_id
    AND (
      d.created_by = cms.get_current_user_account_id()
      OR (d.created_by IS NULL AND cms.can_edit_dashboard(d.id))
    )
  )
  AND COALESCE(
    (
      SELECT r.rank
      FROM cms.roles r
      WHERE r.id = dashboard_role_shares.role_id
    ) < cms.get_user_max_role_rank(cms.get_current_user_account_id()),
    FALSE
  )
);

-- ============================================
-- SECTION: TRIGGERS
-- ============================================

CREATE TRIGGER widget_changes_update_dashboard
AFTER INSERT OR UPDATE OR DELETE ON cms.dashboard_widgets
FOR EACH ROW EXECUTE FUNCTION cms.update_updated_at_column();

-- Audit triggers: every dashboard/widget mutation (including share/unshare,
-- which are access-control changes) must produce a tamper-resistant audit
-- record, mirroring the RBAC tables wired in 30-triggers.sql.
CREATE TRIGGER dashboards_audit_insert_trigger
AFTER INSERT ON cms.dashboards
FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

CREATE TRIGGER dashboards_audit_update_trigger
AFTER UPDATE ON cms.dashboards
FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

CREATE TRIGGER dashboards_audit_delete_trigger
AFTER DELETE ON cms.dashboards
FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

CREATE TRIGGER dashboard_widgets_audit_insert_trigger
AFTER INSERT ON cms.dashboard_widgets
FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

CREATE TRIGGER dashboard_widgets_audit_update_trigger
AFTER UPDATE ON cms.dashboard_widgets
FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

CREATE TRIGGER dashboard_widgets_audit_delete_trigger
AFTER DELETE ON cms.dashboard_widgets
FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

CREATE TRIGGER dashboard_role_shares_audit_insert_trigger
AFTER INSERT ON cms.dashboard_role_shares
FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

CREATE TRIGGER dashboard_role_shares_audit_update_trigger
AFTER UPDATE ON cms.dashboard_role_shares
FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

CREATE TRIGGER dashboard_role_shares_audit_delete_trigger
AFTER DELETE ON cms.dashboard_role_shares
FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

-- ============================================
-- SECTION: CORE FUNCTIONS
-- ============================================

-- Get dashboard details
CREATE OR REPLACE FUNCTION cms.get_dashboard(p_dashboard_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Check access
  IF NOT cms.can_access_dashboard(p_dashboard_id) THEN
    RAISE EXCEPTION 'Dashboard not found or access denied';
  END IF;
  
  SELECT jsonb_build_object(
    'dashboard', row_to_json(d),
    'widgets', (
      SELECT jsonb_agg(row_to_json(w) ORDER BY (w.position->>'y')::int, (w.position->>'x')::int)
      FROM cms.dashboard_widgets w
      WHERE w.dashboard_id = d.id
    ),
    'can_edit', cms.can_edit_dashboard(d.id)
  ) INTO v_result
  FROM cms.dashboards d
  WHERE d.id = p_dashboard_id;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- List dashboards
CREATE OR REPLACE FUNCTION cms.list_dashboards(
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20,
  p_search TEXT DEFAULT NULL,
  p_filter VARCHAR(20) DEFAULT 'all'
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_user_id UUID;
  v_offset INTEGER;
  v_dashboards JSONB;
  v_total INTEGER;
BEGIN
  -- [TFG] RNF-02 · Corrección de PymeKit: listar paneles exige acceso de
  -- administración vigente (claim, cuenta activa y MFA).
  IF NOT cms.verify_admin_access() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_current_user_id := cms.get_current_user_account_id();
  
  -- Validate inputs
  p_page := GREATEST(1, p_page);
  p_page_size := LEAST(GREATEST(1, p_page_size), 100);
  v_offset := (p_page - 1) * p_page_size;
  
  WITH accessible AS (
    SELECT DISTINCT
      d.*,
      d.created_by = v_current_user_id AS is_owner,
      CASE 
        WHEN d.created_by = v_current_user_id THEN 'owner'
        ELSE drs.permission_level
      END AS permission_level,
      COUNT(DISTINCT dw.id) AS widget_count
    FROM cms.dashboards d
    LEFT JOIN cms.dashboard_role_shares drs ON 
      drs.dashboard_id = d.id 
      AND EXISTS (
        SELECT 1 FROM cms.account_roles ar 
        WHERE ar.role_id = drs.role_id 
        AND ar.account_id = v_current_user_id
      )
    LEFT JOIN cms.dashboard_widgets dw ON dw.dashboard_id = d.id
    WHERE 
      d.created_by = v_current_user_id OR drs.dashboard_id IS NOT NULL
    GROUP BY d.id, drs.permission_level
  ),
  filtered AS (
    SELECT * FROM accessible
    WHERE 
      (p_search IS NULL OR name ILIKE '%' || cms.sanitize_identifier(p_search) || '%')
      AND (
        p_filter = 'all' OR
        (p_filter = 'owned' AND is_owner) OR
        (p_filter = 'shared' AND NOT is_owner)
      )
  )
  SELECT 
    jsonb_build_object(
      'dashboards', jsonb_agg(row_to_json(f) ORDER BY f.updated_at DESC),
      'pagination', jsonb_build_object(
        'page', p_page,
        'page_size', p_page_size,
        'total', COUNT(*) OVER()
      )
    ) INTO v_dashboards
  FROM (
    SELECT * FROM filtered
    LIMIT p_page_size OFFSET v_offset
  ) f;
  
  RETURN COALESCE(v_dashboards, jsonb_build_object(
    'dashboards', '[]'::jsonb,
    'pagination', jsonb_build_object('page', 1, 'page_size', p_page_size, 'total', 0)
  ));
END;
$$ LANGUAGE plpgsql;

-- Share dashboard
-- Alineada con la versión que dejan las migraciones (el esquema declarativo
-- heredado estaba desfasado respecto a ellas). Ver ADR-015.
CREATE OR REPLACE FUNCTION cms.share_dashboard_with_role(p_dashboard_id uuid, p_role_id uuid, p_permission_level cms.dashboard_permission_level DEFAULT 'view'::cms.dashboard_permission_level)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_current_user_id UUID;
  v_current_priority INT;
  v_target_priority INT;
  v_result cms.dashboard_role_shares;
BEGIN
  IF NOT cms.verify_admin_access() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_current_user_id := cms.get_current_user_account_id();

  IF NOT EXISTS (
    SELECT 1 FROM cms.dashboards
    WHERE id = p_dashboard_id AND created_by = v_current_user_id
  ) THEN
    RAISE EXCEPTION 'Dashboard not found or you do not own it';
  END IF;

  -- Fails closed: a NULL on either side rejects the share.
  v_current_priority := cms.get_user_max_role_rank(v_current_user_id);
  SELECT rank INTO v_target_priority FROM cms.roles WHERE id = p_role_id;

  IF COALESCE(v_current_priority <= v_target_priority, TRUE) THEN
    RAISE EXCEPTION 'Cannot share with equal or higher priority roles';
  END IF;

  INSERT INTO cms.dashboard_role_shares (
    dashboard_id, role_id, permission_level, granted_by
  )
  VALUES (p_dashboard_id, p_role_id, p_permission_level, v_current_user_id)
  ON CONFLICT (dashboard_id, role_id) DO UPDATE SET
    permission_level = EXCLUDED.permission_level,
    granted_at = NOW()
  RETURNING * INTO v_result;

  RETURN jsonb_build_object(
    'dashboard_id', v_result.dashboard_id,
    'role_id', v_result.role_id,
    'permission_level', v_result.permission_level,
    'granted_at', v_result.granted_at,
    'granted_by', v_result.granted_by
  );
END;
$function$;

-- Remove share
CREATE OR REPLACE FUNCTION cms.unshare_dashboard_from_role(
  p_dashboard_id UUID,
  p_role_id UUID
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM cms.dashboards
    WHERE id = p_dashboard_id 
    AND created_by = cms.get_current_user_account_id()
  ) THEN
    RAISE EXCEPTION 'Dashboard not found or you do not own it';
  END IF;
  
  DELETE FROM cms.dashboard_role_shares
  WHERE dashboard_id = p_dashboard_id AND role_id = p_role_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- Create dashboard
-- Alineada con la versión que dejan las migraciones (el esquema declarativo
-- heredado estaba desfasado respecto a ellas). Ver ADR-015.
CREATE OR REPLACE FUNCTION cms.create_dashboard(p_name text, p_role_shares jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_current_user_id UUID;
  v_result cms.dashboards;
  v_role_share JSONB;
  v_role_id UUID;
  v_permission_level cms.dashboard_permission_level;
BEGIN
  IF NOT cms.verify_admin_access() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_current_user_id := cms.get_current_user_account_id();

  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_name IS NULL OR LENGTH(TRIM(p_name)) < 3 THEN
    RAISE EXCEPTION 'Dashboard name must be at least 3 characters' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO cms.dashboards (name, created_by)
  VALUES (TRIM(p_name), v_current_user_id)
  RETURNING * INTO v_result;

  IF p_role_shares IS NOT NULL AND jsonb_typeof(p_role_shares) = 'array' THEN
    FOR v_role_share IN SELECT * FROM jsonb_array_elements(p_role_shares)
    LOOP
      v_role_id := (v_role_share->>'roleId')::UUID;
      v_permission_level := (v_role_share->>'permissionLevel')::cms.dashboard_permission_level;

      IF v_role_id IS NOT NULL AND v_permission_level IS NOT NULL THEN
        PERFORM cms.share_dashboard_with_role(
          v_result.id,
          v_role_id,
          v_permission_level
        );
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'id', v_result.id,
    'name', v_result.name,
    'created_by', v_result.created_by,
    'created_at', v_result.created_at,
    'updated_at', v_result.updated_at
  );
END;
$function$;

-- ============================================
-- SECTION: GRANTS
-- ============================================

-- [TFG] RNF-02 · `UPDATE` por columnas (F2.8, BITACORA B-50): un editor de un
-- panel compartido solo puede renombrarlo. Con el `UPDATE` de tabla completa
-- heredado podía cambiar `created_by` y quedarse con la propiedad del panel.
GRANT SELECT, INSERT, DELETE ON cms.dashboards TO authenticated;
GRANT UPDATE (name, updated_at) ON cms.dashboards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cms.dashboard_widgets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cms.dashboard_role_shares TO authenticated;
GRANT EXECUTE ON FUNCTION cms.can_access_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION cms.can_edit_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION cms.get_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION cms.list_dashboards TO authenticated;
GRANT EXECUTE ON FUNCTION cms.share_dashboard_with_role TO authenticated;
GRANT EXECUTE ON FUNCTION cms.unshare_dashboard_from_role TO authenticated;
GRANT EXECUTE ON FUNCTION cms.create_dashboard TO authenticated;