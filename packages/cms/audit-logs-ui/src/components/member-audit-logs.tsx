/**
 * Registro de auditoría de un miembro del CMS (componente reutilizable).
 *
 * Lo usará la pantalla de miembros de los ajustes (F2.7a) para mostrar la
 * actividad de una cuenta del CMS: pide `GET /v1/audit-logs/member/:id` con
 * `useQuery` y pagina con cursor en un estado local (la pila de cursores de
 * las páginas anteriores), porque vive dentro de otra página y no debe
 * adueñarse de su URL.
 *
 * Si la API responde 403 (la cuenta es de rango superior al del lector, o
 * no tiene `log:select`) se muestra un aviso en lugar de la tabla: la
 * interfaz no decide nada, solo refleja la respuesta.
 */
import { useState } from 'react';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ShieldAlertIcon, TriangleAlertIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { getCmsAccessFailure } from '@pymekit/cms-ui-core/errors';
import { Alert, AlertDescription } from '@pymekit/ui/alert';
import { Skeleton } from '@pymekit/ui/skeleton';

import { AuditLogsTable } from './audit-logs-table';

/** Entradas por página del registro de un miembro. */
const MEMBER_AUDIT_LOGS_PAGE_SIZE = 10;

export function MemberAuditLogs(props: { accountId: string }) {
  const t = useTranslations('cms.auditLogs.member');
  const { queries } = useCmsApi();

  // Un único estado: el cursor de la página actual y los de las anteriores.
  const [page, setPage] = useState<{ cursor?: string; previous: string[] }>({
    previous: [],
  });

  const query = useQuery({
    ...queries.memberAuditLogs({
      accountId: props.accountId,
      cursor: page.cursor,
      limit: MEMBER_AUDIT_LOGS_PAGE_SIZE,
    }),
    placeholderData: keepPreviousData,
  });

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-2" data-testid="member-audit-logs">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    const forbidden = getCmsAccessFailure(query.error) === 'forbidden';

    return (
      <Alert
        data-testid="member-audit-logs"
        data-state={forbidden ? 'forbidden' : 'error'}
      >
        {forbidden ? (
          <ShieldAlertIcon className="h-4 w-4" />
        ) : (
          <TriangleAlertIcon className="h-4 w-4" />
        )}
        <AlertDescription>
          {forbidden ? t('forbidden') : t('loadError')}
        </AlertDescription>
      </Alert>
    );
  }

  const { logs, hasMore, nextCursor } = query.data;

  return (
    <div className="flex flex-col gap-2" data-testid="member-audit-logs">
      <h2 className="text-sm font-medium">{t('title')}</h2>

      <AuditLogsTable
        testId="member-audit-logs-table"
        logs={logs}
        isLoading={query.isPlaceholderData}
        hasPrevious={page.previous.length > 0 || Boolean(page.cursor)}
        hasNext={hasMore && Boolean(nextCursor)}
        onPrevious={() =>
          setPage((current) => {
            const previous = [...current.previous];
            const cursor = previous.pop();

            return { cursor: cursor || undefined, previous };
          })
        }
        onNext={() => {
          if (nextCursor) {
            setPage((current) => ({
              cursor: nextCursor,
              previous: [...current.previous, current.cursor ?? ''],
            }));
          }
        }}
      />
    </div>
  );
}
