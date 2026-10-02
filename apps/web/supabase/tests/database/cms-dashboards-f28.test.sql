-- [TFG] RF-11 · RNF-02 · F2.8: endurecimiento de los widgets de los paneles.
--
-- Comprueba la política `update_widgets` con WITH CHECK (migración
-- 20261002110000_cms_dashboards_f28): quien puede editar un panel no puede
-- apuntar un widget a una tabla que no puede leer ni moverlo a un panel que
-- no puede editar; crear sigue exigiendo lo mismo (`insert_widgets`) y quien
-- solo puede ver el panel no cambia nada.

BEGIN;

-- Sesiones sin segundo factor (la regla de MFA se prueba en
-- cms-super-admin-root.test.sql). El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

SELECT plan(11);

-- ============================================
-- PREPARACIÓN
-- ============================================

SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(1), 'f28owner', 'f28owner@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(2), 'f28editor', 'f28editor@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(3), 'f28viewer', 'f28viewer@test.com');

INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
  (cms_tests.test_uuid(101), cms_tests.test_uuid(1), true),
  (cms_tests.test_uuid(102), cms_tests.test_uuid(2), true),
  (cms_tests.test_uuid(103), cms_tests.test_uuid(3), true);

INSERT INTO cms.roles (id, name, description, rank) VALUES
  (cms_tests.test_uuid(201), 'F28 Owner', 'Owner role', 90),
  (cms_tests.test_uuid(202), 'F28 Editor', 'Editor role', 80),
  (cms_tests.test_uuid(203), 'F28 Viewer', 'Viewer role', 70);

INSERT INTO cms.account_roles (account_id, role_id) VALUES
  (cms_tests.test_uuid(101), cms_tests.test_uuid(201)),
  (cms_tests.test_uuid(102), cms_tests.test_uuid(202)),
  (cms_tests.test_uuid(103), cms_tests.test_uuid(203));

-- Dos tablas gestionadas: el propietario lee ambas; el editor y el lector,
-- solo `f28_public_data`.
INSERT INTO cms.table_metadata (schema_name, table_name, display_name) VALUES
  ('public', 'f28_public_data', 'Public data'),
  ('public', 'f28_secret_data', 'Secret data');

INSERT INTO cms.permissions (id, name, description, permission_type, scope, schema_name, table_name, action) VALUES
  (cms_tests.test_uuid(301), 'f28_public:select', 'Read public data', 'data', 'table', 'public', 'f28_public_data', 'select'),
  (cms_tests.test_uuid(302), 'f28_secret:select', 'Read secret data', 'data', 'table', 'public', 'f28_secret_data', 'select');

INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
  (cms_tests.test_uuid(201), cms_tests.test_uuid(301)),
  (cms_tests.test_uuid(201), cms_tests.test_uuid(302)),
  (cms_tests.test_uuid(202), cms_tests.test_uuid(301)),
  (cms_tests.test_uuid(203), cms_tests.test_uuid(301));

SELECT cms_tests.authenticate_as('f28owner');
SELECT cms_tests.set_admin_access('f28owner@test.com', 'true');

-- Panel compartido (editor: editar; lector: ver) y otro privado.
INSERT INTO cms.dashboards (id, name, created_by) VALUES
  (cms_tests.test_uuid(401), 'F28 shared', cms_tests.test_uuid(101)),
  (cms_tests.test_uuid(402), 'F28 private', cms_tests.test_uuid(101));

INSERT INTO cms.dashboard_role_shares (dashboard_id, role_id, permission_level, granted_by) VALUES
  (cms_tests.test_uuid(401), cms_tests.test_uuid(202), 'edit', cms_tests.test_uuid(101)),
  (cms_tests.test_uuid(401), cms_tests.test_uuid(203), 'view', cms_tests.test_uuid(101));

INSERT INTO cms.dashboard_widgets (id, dashboard_id, widget_type, title, config, position, schema_name, table_name) VALUES
  (cms_tests.test_uuid(501), cms_tests.test_uuid(401), 'metric', 'Public count',
   '{"aggregation":"COUNT","metric":"*"}', '{"x":0,"y":0,"w":3,"h":2}', 'public', 'f28_public_data');

-- ============================================
-- EDITOR (compartido para editar, sin permiso sobre la tabla secreta)
-- ============================================

SELECT cms_tests.authenticate_as('f28editor');
SELECT cms_tests.set_admin_access('f28editor@test.com', 'true');

SELECT lives_ok(
  $$ UPDATE cms.dashboard_widgets SET title = 'Renamed'
     WHERE id = cms_tests.test_uuid(501) $$,
  'El editor puede cambiar el título de un widget de una tabla legible'
);

SELECT throws_ok(
  $$ UPDATE cms.dashboard_widgets SET table_name = 'f28_secret_data'
     WHERE id = cms_tests.test_uuid(501) $$,
  '42501',
  NULL,
  'El editor no puede apuntar un widget a una tabla que no puede leer (WITH CHECK)'
);

SELECT throws_ok(
  $$ UPDATE cms.dashboard_widgets SET dashboard_id = cms_tests.test_uuid(402)
     WHERE id = cms_tests.test_uuid(501) $$,
  '42501',
  NULL,
  'El editor no puede mover un widget a un panel que no puede editar'
);

SELECT throws_ok(
  $$ INSERT INTO cms.dashboard_widgets (dashboard_id, widget_type, title, config, position, schema_name, table_name)
     VALUES (cms_tests.test_uuid(401), 'metric', 'Secret', '{}', '{"x":3,"y":0,"w":3,"h":2}', 'public', 'f28_secret_data') $$,
  '42501',
  NULL,
  'El editor no puede crear un widget sobre una tabla que no puede leer'
);

SELECT is(
  (SELECT table_name::text FROM cms.dashboard_widgets WHERE id = cms_tests.test_uuid(501)),
  'f28_public_data',
  'El widget sigue apuntando a la tabla legible'
);

-- ============================================
-- LECTOR (compartido solo para ver)
-- ============================================

SELECT cms_tests.authenticate_as('f28viewer');
SELECT cms_tests.set_admin_access('f28viewer@test.com', 'true');

SELECT ok(
  cms.can_access_dashboard(cms_tests.test_uuid(401))
  AND NOT cms.can_edit_dashboard(cms_tests.test_uuid(401)),
  'El lector ve el panel pero no puede editarlo'
);

-- RLS (USING) hace que el UPDATE no afecte a ninguna fila.
UPDATE cms.dashboard_widgets SET title = 'Hacked'
WHERE id = cms_tests.test_uuid(501);

SELECT is(
  (SELECT title::text FROM cms.dashboard_widgets WHERE id = cms_tests.test_uuid(501)),
  'Renamed',
  'El lector no puede cambiar los widgets de un panel compartido para ver'
);

-- ============================================
-- PROPIETARIO (lee ambas tablas)
-- ============================================

SELECT cms_tests.authenticate_as('f28owner');

SELECT lives_ok(
  $$ UPDATE cms.dashboard_widgets SET table_name = 'f28_secret_data'
     WHERE id = cms_tests.test_uuid(501) $$,
  'El propietario puede apuntar el widget a otra tabla que sí puede leer'
);

SELECT is(
  (SELECT table_name::text FROM cms.dashboard_widgets WHERE id = cms_tests.test_uuid(501)),
  'f28_secret_data',
  'El cambio del propietario se guarda'
);

-- B-50: un editor no puede cambiar el propietario de un panel.
select ok(
    not has_column_privilege('authenticated', 'cms.dashboards', 'created_by', 'update'),
    'authenticated no puede actualizar cms.dashboards.created_by'
);

select ok(
    has_column_privilege('authenticated', 'cms.dashboards', 'name', 'update'),
    'authenticated sí puede renombrar un panel (si la política lo permite)'
);

SELECT * FROM finish();

ROLLBACK;
