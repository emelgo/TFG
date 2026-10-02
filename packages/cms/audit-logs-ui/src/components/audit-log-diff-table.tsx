/**
 * Comparación campo a campo de los datos antiguos y nuevos de una entrada.
 *
 * El cálculo está en `buildAuditLogDiff` (puro y probado); aquí solo se
 * pinta: los campos cambiados, añadidos o quitados van primero y resaltados.
 */
import { CheckIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pymekit/ui/table';
import { cn } from '@pymekit/ui/utils';

import {
  type AuditLogDiffEntry,
  toAuditLogDisplayValue,
} from '../utils/audit-log-diff';

export function AuditLogDiffTable(props: { diff: AuditLogDiffEntry[] }) {
  const t = useTranslations('cms.auditLogs.details');

  return (
    <Table data-testid="audit-log-diff">
      <TableHeader>
        <TableRow>
          <TableHead className="w-48">{t('field')}</TableHead>
          <TableHead>{t('oldValue')}</TableHead>
          <TableHead>{t('newValue')}</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {props.diff.map((entry) => {
          const changed = entry.status !== 'unchanged';

          return (
            <TableRow
              key={entry.key}
              data-testid="audit-log-diff-row"
              data-field={entry.key}
              data-status={entry.status}
              className={cn(changed && 'bg-muted/30')}
            >
              <TableCell className="align-top font-medium">
                <span className="flex flex-col gap-0.5">
                  <span className="font-mono text-xs">{entry.key}</span>
                  {changed ? (
                    <span className="text-muted-foreground text-xs">
                      {t(`status.${entry.status}`)}
                    </span>
                  ) : null}
                </span>
              </TableCell>

              <TableCell
                data-testid="audit-log-diff-old"
                className={cn(
                  'align-top',
                  changed && entry.status !== 'added' && 'bg-destructive/10',
                )}
              >
                {entry.status === 'added' ? null : (
                  <DiffValue value={entry.oldValue} />
                )}
              </TableCell>

              <TableCell
                data-testid="audit-log-diff-new"
                className={cn(
                  'align-top',
                  changed && entry.status !== 'removed' && 'bg-primary/10',
                )}
              >
                {entry.status === 'removed' ? null : (
                  <DiffValue value={entry.newValue} />
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function DiffValue(props: { value: unknown }) {
  const t = useTranslations('cms.auditLogs.details');
  const display = toAuditLogDisplayValue(props.value);

  switch (display.kind) {
    case 'empty':
      return <span className="text-muted-foreground italic">{t('empty')}</span>;
    case 'boolean':
      return display.value ? (
        <span className="flex items-center gap-1">
          <CheckIcon className="h-3.5 w-3.5" />
          {t('yes')}
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <XIcon className="h-3.5 w-3.5" />
          {t('no')}
        </span>
      );
    case 'json':
      return (
        <pre className="max-h-40 overflow-auto text-xs whitespace-pre-wrap">
          {display.text}
        </pre>
      );
    case 'text':
      return (
        <span className="break-all whitespace-pre-wrap">{display.text}</span>
      );
  }
}
