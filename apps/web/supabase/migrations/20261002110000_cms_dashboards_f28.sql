-- [TFG] RF-11 · RNF-02 · F2.8: la política de UPDATE de los widgets vuelve a
-- exigir, sobre la fila resultante, que se pueda editar el panel y leer la
-- tabla (`cms.has_data_permission`), igual que al crearlos. Ver
-- schemas/52-cms-dashboards.sql.
drop policy if exists update_widgets on cms.dashboard_widgets;

create policy update_widgets on cms.dashboard_widgets for update
using (cms.can_edit_dashboard(dashboard_id))
with check (
  cms.can_edit_dashboard(dashboard_id)
  and cms.has_data_permission('select', schema_name, table_name)
);
