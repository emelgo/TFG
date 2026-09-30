/**
 * Servicio del registro de auditoría del CMS.
 *
 * Lee la vista `cms.audit_logs_readable` con el cliente Drizzle de la
 * petición, así que cada consulta se ejecuta con la identidad del usuario y
 * PostgreSQL aplica la política RLS `select_cms_audit_logs`
 * (`cms.can_read_audit_log`): permiso `log:select`, acceso vigente al CMS y
 * jerarquía de rangos (nadie lee las entradas de una cuenta de rango superior
 * al suyo). La vista es `security_invoker` y devuelve los datos de fila ya
 * redactados por la base de datos: `authenticated` ni siquiera puede leer
 * `record_id`, `old_data` ni `new_data` de la tabla (endurecimiento F2.6,
 * ver `47-cms-audit-logs.sql`). El servicio añade tres barreras más:
 *
 *  1. **Permiso explícito.** Sin `log:select` responde 403 en lugar de una
 *     lista vacía, y en el registro de un miembro comprueba el rango del
 *     miembro pedido (`can_read_audit_log(cuenta)`) antes de consultar.
 *  2. **Datos de las filas redactados.** Una entrada guarda los datos antiguos
 *     y nuevos de la fila cambiada, que puede ser de una tabla que el lector no
 *     puede leer (la escribió alguien de rango inferior con otros permisos).
 *     `old_data`/`new_data` solo se devuelven si
 *     `cms.can_read_audit_log_data(esquema, tabla)` lo permite (permiso
 *     `select` sobre la tabla, `auth_user:select` para `auth.users`, nunca
 *     otros esquemas protegidos; las del propio esquema `cms` son lo que
 *     `log:select` autoriza a revisar); si no, llegan a `null` con
 *     `dataRedacted = true`, igual que el id del registro afectado. La vista
 *     ya lo hace; la API lo repite como segunda barrera, por si la ruta de
 *     lectura cambiara algún día. El correo
 *     de quien actuó solo se añade con `account:select` o `auth_user:select`.
 *  3. **Errores estables.** Nada de texto de PostgreSQL: `AuditLogsError`.
 *
 * Todo valor del usuario entra en SQL como parámetro enlazado.
 *
 * [TFG] RF-10 · RNF-02: trazabilidad de las acciones del CMS con lectura
 * autorizada en la base de datos.
 */
import {
  type SQL,
  and,
  desc,
  eq,
  gte,
  inArray,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import type { Context } from 'hono';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import { getDrizzleSupabaseAdminClient } from '@pymekit/cms-supabase/client';
import { auditLogsReadableInCms as auditLogs } from '@pymekit/cms-supabase/schema';

import { AuditLogsError } from '../utils/audit-logs-errors';
import {
  AUDIT_LOGS_DEFAULT_PAGE_SIZE,
  type AuditLogCursor,
  type AuditLogsQuery,
  decodeAuditLogCursor,
  isFullUuid,
  paginateAuditLogs,
  toCreatedAtRange,
} from '../utils/audit-logs-query';

/** Filtros del listado general (ya validados por la ruta). */
export type AuditLogsFilters = Omit<AuditLogsQuery, 'cursor' | 'limit'>;

/** Crea el servicio del registro de auditoría para la petición actual. */
export function createAuditLogsService(context: Context) {
  return new AuditLogsService(context);
}

class AuditLogsService {
  constructor(private readonly context: Context) {}

  /**
   * Devuelve una página del registro con filtros y paginación por cursor
   * (`created_at`, `id` descendentes: estable aunque lleguen entradas nuevas).
   *
   * @throws `AuditLogsError` 403 sin `log:select` y 400 con un cursor no válido.
   */
  async getAuditLogs(params: {
    cursor?: string;
    limit?: number;
    filters?: AuditLogsFilters;
  }) {
    const limit = params.limit ?? AUDIT_LOGS_DEFAULT_PAGE_SIZE;
    const conditions = [
      ...cursorConditions(params.cursor),
      ...filterConditions(params.filters ?? {}),
    ];

    const { rows, canReadActorEmails } = await this.readLogs(
      conditions,
      limit + 1,
    );
    const page = paginateAuditLogs(rows, limit);

    return {
      ...page,
      logs: await this.withActorEmails(page.logs, canReadActorEmails),
    };
  }

  /**
   * Devuelve una página de las entradas de una cuenta del CMS (el registro de
   * un miembro, para la ficha de miembros).
   *
   * @throws `AuditLogsError` 403 si el lector no puede leer las entradas de
   *   esa cuenta (sin permiso o de rango superior).
   */
  async getAuditLogsByAccountId(params: {
    accountId: string;
    cursor?: string;
    limit?: number;
  }) {
    const limit = params.limit ?? AUDIT_LOGS_DEFAULT_PAGE_SIZE;
    const conditions = [
      eq(auditLogs.accountId, params.accountId),
      ...cursorConditions(params.cursor),
    ];

    const { rows, canReadActorEmails } = await this.readLogs(
      conditions,
      limit + 1,
      params.accountId,
    );
    const page = paginateAuditLogs(rows, limit);

    return {
      ...page,
      logs: await this.withActorEmails(page.logs, canReadActorEmails),
    };
  }

  /**
   * Devuelve una entrada con el correo de quien la hizo.
   *
   * @throws `AuditLogsError` 403 sin `log:select` y 404 si no existe o RLS no
   *   deja leerla (no se distingue, para no confirmar entradas ajenas).
   */
  async getAuditLogDetails(params: { id: string }) {
    const {
      rows: [log],
      canReadActorEmails,
    } = await this.readLogs([eq(auditLogs.id, params.id)], 1);

    if (!log) {
      throw new AuditLogsError(
        CMS_API_ERROR_CODES.AUDIT_LOG_NOT_FOUND,
        `Audit log ${params.id} not found or not readable`,
      );
    }

    const [withEmail = { ...log, actorEmail: null }] =
      await this.withActorEmails([log], canReadActorEmails);

    return {
      log: withEmail,
      user:
        log.userId && withEmail.actorEmail
          ? { id: log.userId, email: withEmail.actorEmail }
          : null,
    };
  }

  /**
   * Lee entradas con la identidad del usuario (RLS) tras comprobar el
   * permiso. Si se indica `accountId`, exige además poder leer las entradas
   * de esa cuenta.
   */
  private async readLogs(
    conditions: Array<SQL | undefined>,
    limit: number,
    accountId?: string,
  ) {
    const client = this.context.get('drizzle');

    // El rechazo se devuelve desde la transacción y se lanza fuera: el
    // cliente Drizzle envuelve (y registra como fallo) cualquier error lanzado
    // dentro, y un 403 esperado no es un fallo del servidor.
    const result = await client.runTransaction(async (tx) => {
      const [access] = (await tx.execute(sql`
        select
          cms.has_admin_permission('log'::cms.system_resource, 'select'::cms.system_action) as can_read_logs,
          ${accountId ? sql`cms.can_read_audit_log(${accountId}::uuid)` : sql`true`} as can_read_account,
          (
            cms.has_admin_permission('account'::cms.system_resource, 'select'::cms.system_action)
            or cms.has_admin_permission('auth_user'::cms.system_resource, 'select'::cms.system_action)
          ) as can_read_actor_emails
      `)) as Array<{
        can_read_logs: boolean;
        can_read_account: boolean;
        can_read_actor_emails: boolean;
      }>;

      if (!access?.can_read_logs || !access.can_read_account) {
        return { denied: true as const };
      }

      // Segunda barrera: la vista ya devuelve los datos redactados, pero la
      // consulta vuelve a preguntar a la función SQL, fila a fila, si el
      // lector puede leer la tabla de la entrada.
      const dataReadable = sql`cms.can_read_audit_log_data(${auditLogs.schemaName}, ${auditLogs.tableName})`;

      const rows = await tx
        .select({
          id: auditLogs.id,
          createdAt: auditLogs.createdAt,
          accountId: auditLogs.accountId,
          userId: auditLogs.userId,
          operation: auditLogs.operation,
          schemaName: auditLogs.schemaName,
          tableName: auditLogs.tableName,
          // El id del registro afectado también es un dato de la tabla (en
          // `auth.users`, el id o el correo de un usuario): se redacta igual.
          recordId: sql<
            string | null
          >`case when ${dataReadable} then ${auditLogs.recordId} end`,
          severity: auditLogs.severity,
          metadata: auditLogs.metadata,
          oldData:
            sql<unknown>`case when ${dataReadable} then ${auditLogs.oldData} end`.mapWith(
              auditLogs.oldData,
            ),
          newData:
            sql<unknown>`case when ${dataReadable} then ${auditLogs.newData} end`.mapWith(
              auditLogs.newData,
            ),
          // La vista ya marca las entradas redactadas (sus datos llegan a
          // `null`, así que no se pueden volver a comprobar aquí).
          dataRedacted:
            sql<boolean>`(${auditLogs.dataRedacted} or (not ${dataReadable} and (${auditLogs.oldData} is not null or ${auditLogs.newData} is not null or ${auditLogs.recordId} is not null)))`.mapWith(
              Boolean,
            ),
        })
        .from(auditLogs)
        .where(and(...conditions))
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(limit);

      return {
        denied: false as const,
        canReadActorEmails: access.can_read_actor_emails === true,
        rows: rows.map((row) => ({
          ...row,
          oldData: row.oldData as Record<string, unknown> | null,
          newData: row.newData as Record<string, unknown> | null,
        })),
      };
    });

    if (result.denied) {
      throw new AuditLogsError(
        CMS_API_ERROR_CODES.AUDIT_LOG_PERMISSION_DENIED,
        accountId
          ? `Cannot read audit logs of account ${accountId}`
          : 'Missing log:select permission',
      );
    }

    return {
      rows: result.rows,
      canReadActorEmails: result.canReadActorEmails,
    };
  }

  /**
   * Añade el correo de quien hizo cada entrada.
   *
   * `auth.users` no es legible con la identidad del usuario, así que se usa
   * el cliente administrador (ignora RLS). Se limita a lo imprescindible:
   * solo si el lector puede ver miembros o usuarios (`account:select` o
   * `auth_user:select`; si no, ve el id), solo para los autores de entradas
   * que RLS ya le ha dejado leer, con sus ids como parámetros enlazados, y
   * solo se devuelve el correo.
   */
  private async withActorEmails<T extends { userId: string | null }>(
    logs: T[],
    allowed: boolean,
  ) {
    const ids = [
      ...new Set(
        logs.map((log) => log.userId).filter((id): id is string => !!id),
      ),
    ];

    if (!allowed || ids.length === 0) {
      return logs.map((log) => ({ ...log, actorEmail: null as string | null }));
    }

    const rows = (await getDrizzleSupabaseAdminClient().execute(
      sql`select id::text as id, email from auth.users where id in (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    )) as unknown as Array<{ id: string; email: string | null }>;

    const emails = new Map(rows.map((row) => [row.id, row.email]));

    return logs.map((log) => ({
      ...log,
      actorEmail: (log.userId ? emails.get(log.userId) : null) ?? null,
    }));
  }
}

/** Condiciones del cursor (entradas anteriores a la última de la página). */
function cursorConditions(cursor: string | undefined) {
  if (!cursor) {
    return [];
  }

  const position: AuditLogCursor | null = decodeAuditLogCursor(cursor);

  if (!position) {
    throw new AuditLogsError(
      CMS_API_ERROR_CODES.AUDIT_LOG_INVALID_FILTER,
      'Invalid audit log cursor',
    );
  }

  return [
    or(
      lt(auditLogs.createdAt, position.createdAt),
      and(
        eq(auditLogs.createdAt, position.createdAt),
        lt(auditLogs.id, position.id),
      ),
    ),
  ];
}

/** Condiciones de los filtros del listado general. */
function filterConditions(filters: AuditLogsFilters) {
  const conditions: Array<SQL | undefined> = [];

  if (filters.author) {
    if (isFullUuid(filters.author)) {
      conditions.push(
        or(
          eq(auditLogs.accountId, filters.author),
          eq(auditLogs.userId, filters.author),
        ),
      );
    } else {
      // Búsqueda parcial por el principio o cualquier trozo del id. El
      // patrón solo admite dígitos hexadecimales y guiones (validado), así
      // que no contiene comodines de LIKE.
      const pattern = `%${filters.author}%`;

      conditions.push(
        sql`(${auditLogs.accountId}::text ilike ${pattern} or ${auditLogs.userId}::text ilike ${pattern})`,
      );
    }
  }

  if (filters.action && filters.action.length > 0) {
    conditions.push(inArray(auditLogs.operation, filters.action));
  }

  if (filters.schema) {
    conditions.push(eq(auditLogs.schemaName, filters.schema));
  }

  if (filters.table) {
    conditions.push(eq(auditLogs.tableName, filters.table));
  }

  if (filters.severity) {
    conditions.push(eq(auditLogs.severity, filters.severity));
  }

  const range = toCreatedAtRange(filters);

  if (range.from) {
    conditions.push(gte(auditLogs.createdAt, range.from));
  }

  if (range.toExclusive) {
    conditions.push(lt(auditLogs.createdAt, range.toExclusive));
  }

  return conditions;
}
