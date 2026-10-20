/**
 * Ficha de una entrada del registro de auditoría
 * (`/admin/cms/audit-logs/$id`).
 *
 * Muestra quién hizo qué, cuándo y sobre qué registro, los metadatos y, en
 * pestañas, la comparación campo a campo (`AuditLogDiffTable`) y los datos
 * antiguos y nuevos en JSON. Si la API ha redactado los datos (el lector no
 * puede leer la tabla afectada), se explica en lugar de mostrarlos.
 *
 * El texto de los datos se pinta siempre como texto (React lo escapa): una
 * entrada puede contener cualquier contenido que un usuario guardó en la
 * tabla, incluido HTML.
 */
import { Link } from '@tanstack/react-router';
import {
  ClipboardListIcon,
  ClockIcon,
  DatabaseIcon,
  EyeOffIcon,
  ShieldAlertIcon,
  TagIcon,
  UserIcon,
} from 'lucide-react';
import { useTranslations } from 'use-intl';

import { useDateFormatter } from '@pymekit/cms-formatters/hooks';
import type { CmsAuditLogDetails } from '@pymekit/cms-ui-core/api';
import { useIsHydrated } from '@pymekit/cms-ui-core/hydration';
import { CMS_SECTION_PATHS } from '@pymekit/cms-ui-core/sections';
import { Alert, AlertDescription } from '@pymekit/ui/alert';
import { Badge } from '@pymekit/ui/badge';
import { CopyToClipboard } from '@pymekit/ui/copy-to-clipboard';
import { PageSummary } from '@pymekit/ui/page';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pymekit/ui/tabs';

import {
  buildAuditLogDiff,
  countAuditLogChanges,
} from '../utils/audit-log-diff';
import { getAuditLogRecordHref } from '../utils/audit-log-links';
import { AuditLogDiffTable } from './audit-log-diff-table';
import { AuditLogActor } from './audit-logs-table';
import { SeverityBadge } from './severity-badge';

export function AuditLogDetailsView(props: { data: CmsAuditLogDetails }) {
  const t = useTranslations('cms.auditLogs');
  const hydrated = useIsHydrated();
  const formatDate = useDateFormatter();
  const { log, user } = props.data;

  const resource = `${log.schemaName}.${log.tableName}`;
  const diff = buildAuditLogDiff(log.oldData, log.newData);
  const recordHref = log.dataRedacted ? null : getAuditLogRecordHref(log);
  const metadata = Object.entries(
    (log.metadata as Record<string, unknown> | null) ?? {},
  );

  return (
    <div
      className="flex max-w-5xl flex-col gap-6"
      data-testid="audit-log-details"
      data-hydrated={hydrated}
    >
      <nav className="flex items-center gap-2 text-sm">
        <Link
          to={CMS_SECTION_PATHS.auditLogs}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5"
          data-testid="audit-log-details-back"
        >
          <ClipboardListIcon className="h-3.5 w-3.5" />
          {t('title')}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-mono text-xs">{log.id.slice(0, 8)}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className="font-mono"
          data-testid="audit-log-details-operation"
        >
          {log.operation}
        </Badge>
        <h1
          className="text-xl font-semibold"
          data-testid="audit-log-details-resource"
        >
          {resource}
        </h1>
      </div>

      <PageSummary>{t('details.summary')}</PageSummary>

      <dl className="grid max-w-3xl gap-2 text-sm">
        <InfoRow icon={<UserIcon />} label={t('details.performedBy')}>
          <span data-testid="audit-log-details-actor">
            {user?.email ?? <AuditLogActor log={log} />}
          </span>
        </InfoRow>

        <InfoRow icon={<ClockIcon />} label={t('details.timestamp')}>
          {formatDate(new Date(log.createdAt), 'dd MMM yyyy, HH:mm:ss')}
        </InfoRow>

        <InfoRow icon={<ShieldAlertIcon />} label={t('details.severity')}>
          <SeverityBadge severity={log.severity} />
        </InfoRow>

        {log.recordId ? (
          <InfoRow icon={<DatabaseIcon />} label={t('details.record')}>
            <span className="flex items-center gap-2">
              <CopyToClipboard
                value={log.recordId}
                className="font-mono text-xs"
              >
                <span data-testid="audit-log-details-record-id">
                  {log.recordId}
                </span>
              </CopyToClipboard>
              {recordHref ? (
                <Link
                  to={recordHref}
                  className="text-primary text-xs underline-offset-4 hover:underline"
                  data-testid="audit-log-details-open-record"
                >
                  {t('details.openRecord')}
                </Link>
              ) : null}
            </span>
          </InfoRow>
        ) : null}

        {metadata.length > 0 ? (
          <InfoRow icon={<TagIcon />} label={t('details.metadata')}>
            <span className="flex flex-col gap-0.5 font-mono text-xs">
              {metadata.map(([key, value]) => (
                <span key={key}>
                  {key}:{' '}
                  {typeof value === 'object'
                    ? JSON.stringify(value)
                    : String(value)}
                </span>
              ))}
            </span>
          </InfoRow>
        ) : null}
      </dl>

      {log.dataRedacted ? (
        <Alert data-testid="audit-log-details-redacted">
          <EyeOffIcon className="h-4 w-4" />
          <AlertDescription>
            {t('details.redacted', { resource })}
          </AlertDescription>
        </Alert>
      ) : (
        <Tabs defaultValue="diff">
          <TabsList>
            <TabsTrigger value="diff" data-testid="audit-log-tab-diff">
              {t('details.tabs.diff')}
            </TabsTrigger>
            <TabsTrigger value="old" data-testid="audit-log-tab-old">
              {t('details.tabs.oldData')}
            </TabsTrigger>
            <TabsTrigger value="new" data-testid="audit-log-tab-new">
              {t('details.tabs.newData')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="diff" className="flex flex-col gap-2 pt-2">
            {diff.length > 0 ? (
              <>
                <span
                  className="text-muted-foreground text-xs"
                  data-testid="audit-log-changes-count"
                >
                  {t('details.changesCount', {
                    count: countAuditLogChanges(diff),
                  })}
                </span>
                <AuditLogDiffTable diff={diff} />
              </>
            ) : (
              <EmptyText>{t('details.noChanges')}</EmptyText>
            )}
          </TabsContent>

          <TabsContent value="old" className="pt-2">
            <JsonBlock
              value={log.oldData}
              empty={t('details.noOldData')}
              testId="audit-log-old-data"
            />
          </TabsContent>

          <TabsContent value="new" className="pt-2">
            <JsonBlock
              value={log.newData}
              empty={t('details.noNewData')}
              testId="audit-log-new-data"
            />
          </TabsContent>
        </Tabs>
      )}

      <p className="text-muted-foreground text-xs">
        {t('details.logId', { id: log.id })}
      </p>
    </div>
  );
}

function InfoRow(
  props: React.PropsWithChildren<{ icon: React.ReactNode; label: string }>,
) {
  return (
    <div className="flex items-start gap-2">
      <dt className="text-muted-foreground flex w-36 shrink-0 items-center gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5">
        {props.icon}
        {props.label}
      </dt>
      <dd className="min-w-0">{props.children}</dd>
    </div>
  );
}

function JsonBlock(props: {
  value: Record<string, unknown> | null;
  empty: string;
  testId: string;
}) {
  if (!props.value) {
    return <EmptyText>{props.empty}</EmptyText>;
  }

  return (
    <pre
      data-testid={props.testId}
      className="bg-muted/40 max-h-[28rem] overflow-auto rounded-md border p-3 text-xs"
    >
      {JSON.stringify(props.value, null, 2)}
    </pre>
  );
}

function EmptyText(props: React.PropsWithChildren) {
  return (
    <p className="text-muted-foreground py-8 text-center text-sm">
      {props.children}
    </p>
  );
}
