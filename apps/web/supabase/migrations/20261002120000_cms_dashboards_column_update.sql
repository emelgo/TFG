/*
 * F2.8 (BITACORA B-50): `UPDATE` por columnas en cms.dashboards. Un editor de
 * un panel compartido solo puede renombrarlo; ya no puede cambiar
 * `created_by` para apropiarse del panel.
 */
revoke update on cms.dashboards from authenticated;

grant update (name, updated_at) on cms.dashboards to authenticated;
