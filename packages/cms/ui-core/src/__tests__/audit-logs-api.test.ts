/**
 * Pruebas de la traducción de los filtros del registro de auditoría a la
 * *query string* de la API y de sus claves de caché.
 */
import { describe, expect, it } from 'vitest';

import { toAuditLogsQuery } from '../audit-logs-api';
import { cmsQueryKeys } from '../queries';

describe('toAuditLogsQuery', () => {
  it('omite los filtros vacíos', () => {
    expect(toAuditLogsQuery({ actions: [], author: '' })).toEqual({});
  });

  it('une las operaciones con comas y pasa el resto como texto', () => {
    expect(
      toAuditLogsQuery({
        cursor: 'abc',
        limit: 50,
        author: 'c5b9',
        actions: ['INSERT', 'UPDATE'],
        schema: 'public',
        table: 'notifications',
        severity: 'error',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      }),
    ).toEqual({
      cursor: 'abc',
      limit: '50',
      author: 'c5b9',
      action: 'INSERT,UPDATE',
      schema: 'public',
      table: 'notifications',
      severity: 'error',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
  });
});

describe('cmsQueryKeys.auditLogsList', () => {
  it('el orden de las operaciones no cambia la entrada de caché', () => {
    expect(
      cmsQueryKeys.auditLogsList({ actions: ['UPDATE', 'INSERT'] }),
    ).toEqual(cmsQueryKeys.auditLogsList({ actions: ['INSERT', 'UPDATE'] }));
  });

  it('cuelga del prefijo del registro de auditoría', () => {
    expect(cmsQueryKeys.auditLog('x').slice(0, 2)).toEqual(
      cmsQueryKeys.auditLogs(),
    );
  });
});
