/**
 * Tabla de entradas del registro de auditoría.
 *
 * Es un componente de presentación reutilizable: la usan el listado general
 * (`AuditLogsView`) y el registro de un miembro (`MemberAuditLogs`, para la
 * pantalla de miembros). Recibe las entradas ya cargadas y los controles de
 * paginación por cursor (anterior/siguiente); un clic en una fila abre la
 * ficha de la entrada.
 */
import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronLeftIcon, ChevronRightIcon, UserIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { useDateFormatter } from '@pymekit/cms-formatters/hooks';
import type { CmsAuditLog } from '@pymekit/cms-ui-core/api';
import { Badge } from '@pymekit/ui/badge';
import { Button } from '@pymekit/ui/button';
import { DataTable } from '@pymekit/ui/enhanced-data-table';
import { cn } from '@pymekit/ui/utils';

import { getAuditLogHref } from '../utils/audit-log-links';
import { SeverityBadge } from './severity-badge';

export function AuditLogsTable(props: {
  logs: CmsAuditLog[];
  isLoading?: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  testId?: string;
}) {
  const t = useTranslations('cms.auditLogs.table');
  const navigate = useNavigate();
  const formatDate = useDateFormatter();

  const columns: ColumnDef<CmsAuditLog>[] = [
    {
      id: 'createdAt',
      header: t('timestamp'),
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {formatDate(
            new Date(row.original.createdAt),
            'dd MMM yyyy, HH:mm:ss',
          )}
        </span>
      ),
    },
    {
      id: 'performedBy',
      header: t('performedBy'),
      cell: ({ row }) => <AuditLogActor log={row.original} />,
    },
    {
      id: 'operation',
      header: t('operation'),
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className="font-mono"
          data-testid="audit-log-operation"
        >
          {row.original.operation}
        </Badge>
      ),
    },
    {
      id: 'resource',
      header: t('resource'),
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium" data-testid="audit-log-resource">
            {row.original.schemaName}.{row.original.tableName}
          </span>
          {row.original.recordId ? (
            <span
              className="text-muted-foreground max-w-56 truncate text-xs"
              data-testid="audit-log-record-id"
            >
              {t('recordId', { id: row.original.recordId })}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'severity',
      header: t('severity'),
      cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <DataTable<CmsAuditLog>
        className={cn(
          'transition-opacity duration-300',
          props.isLoading && 'opacity-50',
        )}
        columns={columns}
        data={props.logs}
        getRowId={(log) => log.id}
        pageIndex={0}
        pageSize={Math.max(props.logs.length, 1)}
        pageCount={1}
        tableProps={{ 'data-testid': props.testId ?? 'audit-logs-table' }}
        onClick={({ row }) =>
          void navigate({ href: getAuditLogHref(row.original.id) })
        }
        noResultsMessage={t('noResults')}
      />

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="audit-logs-previous"
          disabled={!props.hasPrevious}
          onClick={props.onPrevious}
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          {t('previous')}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="audit-logs-next"
          disabled={!props.hasNext}
          onClick={props.onNext}
        >
          {t('next')}
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Autor de una entrada: su correo, su id o «Sistema» si no hay ninguno.
 *
 * Si el autor se borró después (su FK quedó a `null`), la API devuelve la
 * instantánea que guardó la base de datos al escribir la entrada
 * (`actorEmail`, `actorUserId`) y `actorDeleted = true`: se muestra igual,
 * con una marca de «eliminado», para no perder quién hizo qué (F2.7a).
 */
export function AuditLogActor(props: {
  log: Pick<
    CmsAuditLog,
    'actorEmail' | 'accountId' | 'userId' | 'actorUserId' | 'actorDeleted'
  >;
}) {
  const t = useTranslations('cms.auditLogs.table');
  const { actorEmail, accountId, userId, actorUserId, actorDeleted } =
    props.log;
  const label = actorEmail ?? userId ?? accountId ?? actorUserId;

  if (!label) {
    return <span className="text-muted-foreground italic">{t('system')}</span>;
  }

  return (
    <span className="flex items-center gap-1.5" data-testid="audit-log-actor">
      <UserIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
      <span className={cn('truncate', !actorEmail && 'font-mono text-xs')}>
        {actorEmail ?? `${label.slice(0, 8)}…`}
      </span>
      {actorDeleted ? (
        <Badge
          variant="outline"
          className="text-muted-foreground"
          data-testid="audit-log-actor-deleted"
        >
          {t('actorDeleted')}
        </Badge>
      ) : null}
    </span>
  );
}
