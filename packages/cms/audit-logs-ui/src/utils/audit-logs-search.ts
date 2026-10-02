/**
 * *Search params* del registro de auditoría del CMS (`/admin/cms/audit-logs`).
 *
 * Los filtros y la página viven en la URL, igual que en el resto del CMS:
 * cambiarlos es navegar, así que el historial, los enlaces compartidos y el
 * SSR funcionan igual. La API pagina con cursor (no con número de página),
 * así que la URL guarda el cursor de la página actual (`cursor`) y la pila de
 * cursores de las anteriores (`prev`, con `''` para la primera) para poder
 * volver atrás.
 *
 * Un valor no válido (escrito a mano en la URL) se descarta con `.catch` en
 * lugar de romper la página; la API vuelve a validarlo todo.
 */
import * as z from 'zod';

import type {
  AuditLogSeverity,
  AuditLogsListParams,
} from '@pymekit/cms-ui-core/audit-logs-api';

/**
 * Operaciones que se ofrecen en el filtro: las de las escrituras de datos y
 * las que registran el explorador de usuarios y la gestión del acceso.
 */
export const AUDIT_LOG_OPERATIONS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'create_auth_user',
  'invite_auth_user',
  'ban_user',
  'unban_user',
  'reset_password',
  'send_magic_link',
  'remove_mfa_factor',
  'delete_auth_user',
  'grant_admin_access',
  'revoke_admin_access',
] as const;

export const AUDIT_LOG_SEVERITIES = [
  'info',
  'warning',
  'error',
] as const satisfies readonly AuditLogSeverity[];

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const AuditLogsSearchSchema = z.object({
  cursor: z.string().max(200).optional().catch(undefined),
  prev: z.array(z.string().max(200)).max(100).optional().catch(undefined),
  author: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F-]{1,36}$/)
    .optional()
    .catch(undefined),
  actions: z
    .array(z.string().regex(/^[A-Za-z_]{1,64}$/))
    .max(20)
    .optional()
    .catch(undefined),
  schema: z.string().regex(IDENTIFIER).optional().catch(undefined),
  table: z.string().regex(IDENTIFIER).optional().catch(undefined),
  severity: z.enum(AUDIT_LOG_SEVERITIES).optional().catch(undefined),
  from: z.string().refine(isCalendarDay).optional().catch(undefined),
  to: z.string().refine(isCalendarDay).optional().catch(undefined),
});

export type AuditLogsSearch = z.infer<typeof AuditLogsSearchSchema>;

/** Valores del formulario de filtros (texto tal como lo escribe el usuario). */
export type AuditLogsFilterValues = {
  author: string;
  actions: string[];
  /** `tabla` o `esquema.tabla`. */
  resource: string;
  severity: AuditLogSeverity | '';
  from: string;
  to: string;
};

/** Traduce la URL a los parámetros de la API. */
export function toAuditLogsListParams(
  search: AuditLogsSearch,
): AuditLogsListParams {
  return {
    cursor: search.cursor || undefined,
    author: search.author || undefined,
    actions: search.actions?.length ? search.actions : undefined,
    schema: search.schema || undefined,
    table: search.table || undefined,
    severity: search.severity,
    startDate: search.from || undefined,
    endDate: search.to || undefined,
  };
}

/** Valores iniciales del formulario a partir de la URL. */
export function toAuditLogsFilterValues(
  search: AuditLogsSearch,
): AuditLogsFilterValues {
  return {
    author: search.author ?? '',
    actions: search.actions ?? [],
    resource: formatResourceFilter(search),
    severity: search.severity ?? '',
    from: search.from ?? '',
    to: search.to ?? '',
  };
}

/**
 * Nueva URL al aplicar los filtros: vuelve siempre a la primera página y
 * omite los vacíos. Un recurso mal escrito se ignora.
 */
export function withAuditLogsFilters(
  values: AuditLogsFilterValues,
): AuditLogsSearch {
  const resource = parseResourceFilter(values.resource);
  const author = values.author.trim();

  return {
    author: author || undefined,
    actions: values.actions.length > 0 ? [...values.actions] : undefined,
    schema: resource?.schema,
    table: resource?.table,
    severity: values.severity || undefined,
    from: values.from || undefined,
    to: values.to || undefined,
  };
}

/** Indica si la URL tiene algún filtro aplicado. */
export function hasActiveAuditLogsFilters(search: AuditLogsSearch) {
  return Boolean(
    search.author ||
    search.actions?.length ||
    search.schema ||
    search.table ||
    search.severity ||
    search.from ||
    search.to,
  );
}

/** URL de la página siguiente: guarda la actual en la pila `prev`. */
export function getNextPageSearch(
  search: AuditLogsSearch,
  nextCursor: string,
): AuditLogsSearch {
  return {
    ...search,
    prev: [...(search.prev ?? []), search.cursor ?? ''],
    cursor: nextCursor,
  };
}

/** URL de la página anterior (la primera si la pila está vacía). */
export function getPreviousPageSearch(
  search: AuditLogsSearch,
): AuditLogsSearch {
  const prev = [...(search.prev ?? [])];
  const cursor = prev.pop();

  return {
    ...search,
    prev: prev.length > 0 ? prev : undefined,
    cursor: cursor || undefined,
  };
}

/** Indica si hay una página anterior. */
export function hasPreviousAuditLogsPage(search: AuditLogsSearch) {
  return Boolean(search.cursor) || (search.prev?.length ?? 0) > 0;
}

/**
 * Interpreta el filtro de recurso: `tabla` o `esquema.tabla`. Devuelve
 * `null` si está vacío o no es un identificador válido.
 */
export function parseResourceFilter(
  value: string,
): { schema?: string; table: string } | null {
  const text = value.trim();

  if (!text) {
    return null;
  }

  const parts = text.split('.');

  if (parts.length > 2 || !parts.every((part) => IDENTIFIER.test(part))) {
    return null;
  }

  return parts.length === 2
    ? { schema: parts[0], table: parts[1]! }
    : { table: parts[0]! };
}

/** Texto del filtro de recurso a partir de la URL. */
export function formatResourceFilter(search: {
  schema?: string;
  table?: string;
}) {
  if (search.schema && search.table) {
    return `${search.schema}.${search.table}`;
  }

  return search.table ?? search.schema ?? '';
}

/**
 * Indica si el texto es un día `AAAA-MM-DD` que existe en el calendario (la
 * API rechazaría `2026-02-31` con un 400 y la página entera sería «no
 * encontrado»).
 */
function isCalendarDay(value: string) {
  if (!DAY.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
