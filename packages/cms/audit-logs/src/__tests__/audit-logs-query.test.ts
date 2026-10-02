/**
 * Pruebas de la validación de los parámetros del registro de auditoría:
 * cursores, fechas UTC, listas de operaciones e identificadores, y el
 * código estable de los errores.
 */
import { describe, expect, it } from 'vitest';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

import {
  AuditLogsError,
  classifyAuditLogsError,
} from '../api/utils/audit-logs-errors';
import {
  AuditLogsQuerySchema,
  MemberAuditLogsQuerySchema,
  decodeAuditLogCursor,
  encodeAuditLogCursor,
  paginateAuditLogs,
  toCreatedAtRange,
} from '../api/utils/audit-logs-query';

const ID = '0b6c5f0e-8d2e-4e59-9f3a-1c2b3d4e5f60';
const CREATED_AT = '2026-09-30 09:13:13.646563+00';

describe('cursor del registro de auditoría', () => {
  it('codifica y decodifica sin perder los microsegundos', () => {
    const cursor = encodeAuditLogCursor({ createdAt: CREATED_AT, id: ID });

    expect(cursor).not.toMatch(/[+/=]/);
    expect(decodeAuditLogCursor(cursor)).toEqual({
      createdAt: CREATED_AT,
      id: ID,
    });
  });

  it('rechaza cursores manipulados en lugar de pasarlos a SQL', () => {
    const encode = (text: string) =>
      Buffer.from(text, 'utf-8').toString('base64url');

    expect(decodeAuditLogCursor('not-a-cursor')).toBeNull();
    expect(decodeAuditLogCursor(encode(`${CREATED_AT}|not-a-uuid`))).toBeNull();
    expect(decodeAuditLogCursor(encode(`yesterday|${ID}`))).toBeNull();
    expect(
      decodeAuditLogCursor(encode(`${CREATED_AT}'; drop table x;--|${ID}`)),
    ).toBeNull();
    expect(
      decodeAuditLogCursor(encode(`${CREATED_AT}|${ID}|extra`)),
    ).toBeNull();
    // Horas, desfases o años imposibles (PostgreSQL fallaría al convertirlos).
    for (const createdAt of [
      '2026-01-01 99:99:99+00',
      '2026-01-01 10:00:00+99:99',
      '0000-01-01 00:00:00+00',
    ]) {
      expect(decodeAuditLogCursor(encode(`${createdAt}|${ID}`))).toBeNull();
    }
  });
});

describe('AuditLogsQuerySchema', () => {
  it('acepta los filtros válidos y separa las operaciones', () => {
    const result = AuditLogsQuerySchema.parse({
      limit: '50',
      author: 'c5b930c9',
      action: 'INSERT, UPDATE,ban_user',
      schema: 'public',
      table: 'notifications',
      severity: 'warning',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });

    expect(result).toMatchObject({
      limit: 50,
      action: ['INSERT', 'UPDATE', 'ban_user'],
      severity: 'warning',
    });
  });

  it.each([
    { limit: '101' },
    { limit: '0' },
    { author: "c5b930c9' or 1=1" },
    { author: '%' },
    { action: 'INSERT;DROP' },
    { schema: 'public.accounts' },
    { table: 'accounts"--' },
    { severity: 'critical' },
    { startDate: '2026-02-31' },
    { endDate: '30/09/2026' },
  ])('rechaza %o', (query) => {
    expect(AuditLogsQuerySchema.safeParse(query).success).toBe(false);
  });

  it('limita el tamaño de página del registro de un miembro a 50', () => {
    expect(MemberAuditLogsQuerySchema.safeParse({ limit: '51' }).success).toBe(
      false,
    );
  });
});

describe('toCreatedAtRange', () => {
  it('usa días UTC con límite superior exclusivo', () => {
    expect(
      toCreatedAtRange({ startDate: '2026-09-30', endDate: '2026-12-31' }),
    ).toEqual({
      from: '2026-09-30T00:00:00.000Z',
      toExclusive: '2027-01-01T00:00:00.000Z',
    });
  });

  it('deja abiertos los extremos que no se indican', () => {
    expect(toCreatedAtRange({})).toEqual({
      from: undefined,
      toExclusive: undefined,
    });
  });
});

describe('paginateAuditLogs', () => {
  const rows = [1, 2, 3].map((n) => ({
    id: ID.replace(/0$/, String(n)),
    createdAt: `2026-09-30 09:00:0${n}+00`,
  }));

  it('detecta la fila de más y apunta el cursor a la última de la página', () => {
    const page = paginateAuditLogs(rows, 2);

    expect(page.logs).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(decodeAuditLogCursor(page.nextCursor!)).toEqual(rows[1]);
  });

  it('sin fila de más no hay cursor', () => {
    expect(paginateAuditLogs(rows, 3)).toMatchObject({
      hasMore: false,
      nextCursor: null,
    });
  });
});

describe('classifyAuditLogsError', () => {
  it('traduce los errores controlados a su estado', () => {
    expect(
      classifyAuditLogsError(
        new AuditLogsError(CMS_API_ERROR_CODES.AUDIT_LOG_NOT_FOUND, 'x'),
      ),
    ).toMatchObject({ status: 404, errorCode: 'AUDIT_LOG_NOT_FOUND' });
  });

  it('encuentra el error controlado dentro de la causa', () => {
    const wrapped = new Error('Error in Drizzle transaction', {
      cause: new AuditLogsError(
        CMS_API_ERROR_CODES.AUDIT_LOG_PERMISSION_DENIED,
        'x',
      ),
    });

    expect(classifyAuditLogsError(wrapped)).toMatchObject({
      status: 403,
      errorCode: 'AUDIT_LOG_PERMISSION_DENIED',
    });
  });

  it('un error desconocido es un 500 sin su texto', () => {
    const response = classifyAuditLogsError(
      new Error('relation "cms.secret" does not exist'),
    );

    expect(response).toMatchObject({
      status: 500,
      errorCode: 'AUDIT_LOG_READ_FAILED',
    });
    expect(response.message).not.toContain('cms.secret');
  });
});
