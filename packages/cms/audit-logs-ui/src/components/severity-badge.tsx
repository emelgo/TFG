/**
 * Insignia de la gravedad de una entrada de auditoría.
 */
import { useTranslations } from 'use-intl';

import type { AuditLogSeverity } from '@pymekit/cms-ui-core/audit-logs-api';
import { Badge } from '@pymekit/ui/badge';
import { badgeExtras } from '@pymekit/ui/badge-extras';

export function SeverityBadge(props: { severity: AuditLogSeverity }) {
  const t = useTranslations('cms.auditLogs.severity');

  if (props.severity === 'error') {
    return (
      <Badge variant="destructive" data-testid="audit-log-severity">
        {t('error')}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={props.severity === 'warning' ? badgeExtras.warning : undefined}
      data-testid="audit-log-severity"
    >
      {t(props.severity)}
    </Badge>
  );
}
