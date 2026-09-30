/**
 * Validación de los parámetros del registro de auditoría del CMS
 * (`GET /v1/audit-logs` y `GET /v1/audit-logs/member/:id`).
 *
 * El código de partida aceptaba cualquier texto como fecha o cursor y lo
 * pasaba tal cual a PostgreSQL: una fecha mal escrita producía un 500 con el
 * texto del error, y el fin del día se calculaba con la zona horaria del
 * servidor. Aquí todo se valida antes de consultar (400 con código estable) y
 * las fechas se interpretan siempre como días UTC con un límite superior
 * exclusivo (`< día siguiente`), sin depender del reloj del servidor.
 *
 * Los valores validados solo llegan a SQL como parámetros enlazados de
 * Drizzle; esta validación no sustituye a eso, sino que da errores claros.
 *
 * Es código puro para poder probarlo sin base de datos
 * (`__tests__/audit-logs-query.test.ts`).
 *
 * [TFG] RNF-02: entrada validada y errores internos que no llegan al cliente.
 */
import * as z from 'zod';

/** Tamaño de página por defecto del listado. */
export const AUDIT_LOGS_DEFAULT_PAGE_SIZE = 25;

/** Tamaño máximo de página del listado general. */
export const AUDIT_LOGS_MAX_PAGE_SIZE = 100;

/** Tamaño máximo de página del registro de un miembro. */
export const MEMBER_AUDIT_LOGS_MAX_PAGE_SIZE = 50;

/** Operaciones por las que se puede filtrar a la vez. */
const MAX_ACTIONS = 20;

/** Nombre de operación: `INSERT`, `ban_user`, `grant_admin_access`… */
const OPERATION_PATTERN = /^[A-Za-z_]{1,64}$/;

/** Identificador de PostgreSQL sin comillas (esquema o tabla). */
const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

/** Fragmento de UUID (búsqueda parcial por autor). */
const PARTIAL_UUID_PATTERN = /^[0-9a-fA-F-]{1,36}$/;

const FULL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Marca de tiempo tal como la devuelve PostgreSQL (o ISO 8601), con horas,
 * minutos, segundos y desfase dentro de rango: un valor imposible haría
 * fallar la conversión en PostgreSQL (500) en lugar de dar un 400.
 */
const TIMESTAMP_PATTERN =
  /^[1-9]\d{3}-\d{2}-\d{2}[ T]([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?(Z|[+-](0\d|1[0-4])(:?[0-5]\d)?)?$/;

/** Día en formato `AAAA-MM-DD` que además existe en el calendario. */
const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => isValidCalendarDate(value));

/** Lista de operaciones separadas por comas (`INSERT,UPDATE`). */
const ActionListSchema = z
  .string()
  .max(MAX_ACTIONS * 65)
  .transform((value) =>
    value
      .split(',')
      .map((action) => action.trim())
      .filter(Boolean),
  )
  .refine(
    (actions) =>
      actions.length <= MAX_ACTIONS &&
      actions.every((action) => OPERATION_PATTERN.test(action)),
  );

const SeveritySchema = z.enum(['info', 'warning', 'error']);

/** Parámetros del listado general. */
export const AuditLogsQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(AUDIT_LOGS_MAX_PAGE_SIZE)
    .optional(),
  author: z.string().trim().regex(PARTIAL_UUID_PATTERN).optional(),
  action: ActionListSchema.optional(),
  schema: z.string().regex(IDENTIFIER_PATTERN).optional(),
  table: z.string().regex(IDENTIFIER_PATTERN).optional(),
  severity: SeveritySchema.optional(),
  startDate: DateOnlySchema.optional(),
  endDate: DateOnlySchema.optional(),
});

export type AuditLogsQuery = z.infer<typeof AuditLogsQuerySchema>;

/** Parámetros del registro de un miembro. */
export const MemberAuditLogsQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MEMBER_AUDIT_LOGS_MAX_PAGE_SIZE)
    .optional(),
});

/** Posición de la última entrada de una página (orden descendente). */
export type AuditLogCursor = { createdAt: string; id: string };

/**
 * Codifica la posición de la última entrada de una página. Se usa
 * `base64url` para que el cursor viaje en la URL sin escapar.
 */
export function encodeAuditLogCursor(cursor: AuditLogCursor) {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, 'utf-8').toString(
    'base64url',
  );
}

/**
 * Decodifica un cursor. Devuelve `null` si no tiene el formato esperado
 * (marca de tiempo válida y UUID): el código de partida lo ignoraba y
 * pasaba los trozos a SQL, donde un valor raro acababa en un 500.
 */
export function decodeAuditLogCursor(value: string): AuditLogCursor | null {
  let decoded: string;

  try {
    decoded = Buffer.from(value, 'base64url').toString('utf-8');
  } catch {
    return null;
  }

  const parts = decoded.split('|');

  if (parts.length !== 2) {
    return null;
  }

  const [createdAt, id] = parts as [string, string];

  if (
    // `Date.parse` no entiende el desfase corto de PostgreSQL (`+00`), así
    // que se valida el formato y que el día exista.
    !TIMESTAMP_PATTERN.test(createdAt) ||
    !isValidCalendarDate(createdAt.slice(0, 10)) ||
    !FULL_UUID_PATTERN.test(id)
  ) {
    return null;
  }

  return { createdAt, id };
}

/** Indica si el texto es un UUID completo (búsqueda exacta por autor). */
export function isFullUuid(value: string) {
  return FULL_UUID_PATTERN.test(value);
}

/**
 * Convierte el rango de días (UTC, ambos incluidos) en límites de marca de
 * tiempo: desde las 00:00 del primer día hasta antes de las 00:00 del día
 * siguiente al último.
 */
export function toCreatedAtRange(range: {
  startDate?: string;
  endDate?: string;
}) {
  return {
    from: range.startDate ? `${range.startDate}T00:00:00.000Z` : undefined,
    toExclusive: range.endDate ? nextUtcDay(range.endDate) : undefined,
  };
}

/**
 * Recorta una página de resultados: se piden `limit + 1` filas y, si llegan
 * todas, hay más y el cursor apunta a la última de la página.
 */
export function paginateAuditLogs<T extends AuditLogCursor>(
  rows: T[],
  limit: number,
) {
  const hasMore = rows.length > limit;
  const logs = hasMore ? rows.slice(0, limit) : rows;
  const last = logs[logs.length - 1];

  return {
    logs,
    hasMore,
    nextCursor:
      hasMore && last
        ? encodeAuditLogCursor({ createdAt: last.createdAt, id: last.id })
        : null,
    pageSize: limit,
  };
}

function nextUtcDay(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);

  date.setUTCDate(date.getUTCDate() + 1);

  return date.toISOString();
}

function isValidCalendarDate(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);

  // `new Date('2026-02-31')` se desborda a marzo: se compara con el texto.
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(day);
}
