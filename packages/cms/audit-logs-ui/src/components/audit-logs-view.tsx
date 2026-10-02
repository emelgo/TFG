/**
 * Listado del registro de auditoría del CMS (`/admin/cms/audit-logs`).
 *
 * Recibe la página ya cargada por la ruta (`useSuspenseQuery`) y se limita a
 * presentarla: los filtros y la paginación son cambios de la URL
 * (`onSearchChange`) y un clic en una fila abre la ficha de la entrada.
 *
 * Qué entradas aparecen lo decide la base de datos (RLS con
 * `cms.can_read_audit_log`: permiso `log:select` y jerarquía de rangos); la
 * interfaz no filtra nada por su cuenta.
 *
 * [TFG] RF-10: consulta del registro de auditoría del CMS.
 */
import { ClipboardListIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { CmsAuditLogsPage } from '@pymekit/cms-ui-core/api';
import { useIsHydrated } from '@pymekit/cms-ui-core/hydration';

import {
  type AuditLogsSearch,
  getNextPageSearch,
  getPreviousPageSearch,
  hasActiveAuditLogsFilters,
  hasPreviousAuditLogsPage,
  toAuditLogsFilterValues,
  withAuditLogsFilters,
} from '../utils/audit-logs-search';
import { AuditLogsFilters } from './audit-logs-filters';
import { AuditLogsTable } from './audit-logs-table';

export function AuditLogsView(props: {
  data: CmsAuditLogsPage;
  search: AuditLogsSearch;
  onSearchChange: (search: AuditLogsSearch) => void;
  isLoading?: boolean;
}) {
  const t = useTranslations('cms.auditLogs');
  const hydrated = useIsHydrated();
  const { logs, hasMore, nextCursor } = props.data;

  const filtersKey = JSON.stringify({ ...props.search, cursor: 0, prev: 0 });

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="audit-logs-view"
      data-hydrated={hydrated}
    >
      <h1 className="flex items-center gap-2 text-sm font-medium">
        <ClipboardListIcon className="text-muted-foreground h-4 w-4" />
        {t('title')}
      </h1>

      <AuditLogsFilters
        key={filtersKey}
        initialValues={toAuditLogsFilterValues(props.search)}
        hasActiveFilters={hasActiveAuditLogsFilters(props.search)}
        onApply={(values) => props.onSearchChange(withAuditLogsFilters(values))}
        onClear={() => props.onSearchChange({})}
      />

      <AuditLogsTable
        logs={logs}
        isLoading={props.isLoading}
        hasPrevious={hasPreviousAuditLogsPage(props.search)}
        hasNext={hasMore && Boolean(nextCursor)}
        onPrevious={() =>
          props.onSearchChange(getPreviousPageSearch(props.search))
        }
        onNext={() => {
          if (nextCursor) {
            props.onSearchChange(getNextPageSearch(props.search, nextCursor));
          }
        }}
      />
    </div>
  );
}
