/**
 * Errores del registro de auditoría y su traducción a respuestas HTTP.
 *
 * El código de partida respondía a cualquier fallo con un 500 y el texto del
 * error (`getErrorMessage`), incluido el caso «la entrada no existe o no se
 * puede leer», que además decía `User not found`. Ahora el servicio lanza
 * `AuditLogsError` con un código estable (`AUDIT_LOG_*`) y las rutas
 * responden con su estado y un mensaje genérico; el detalle solo va al *log*.
 *
 * [TFG] RNF-02 Seguridad: los errores internos no llegan al cliente.
 */
import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

export type AuditLogsErrorCode =
  | typeof CMS_API_ERROR_CODES.AUDIT_LOG_PERMISSION_DENIED
  | typeof CMS_API_ERROR_CODES.AUDIT_LOG_NOT_FOUND
  | typeof CMS_API_ERROR_CODES.AUDIT_LOG_INVALID_FILTER
  | typeof CMS_API_ERROR_CODES.AUDIT_LOG_READ_FAILED;

const RESPONSES: Record<
  AuditLogsErrorCode,
  { status: 400 | 403 | 404 | 500; message: string }
> = {
  AUDIT_LOG_PERMISSION_DENIED: {
    status: 403,
    message: 'You do not have permission to read these audit logs',
  },
  AUDIT_LOG_NOT_FOUND: {
    status: 404,
    message: 'The audit log was not found',
  },
  AUDIT_LOG_INVALID_FILTER: {
    status: 400,
    message: 'The audit log filters are not valid',
  },
  AUDIT_LOG_READ_FAILED: {
    status: 500,
    message: 'The audit logs could not be loaded. Please try again later',
  },
};

/** Error controlado del registro de auditoría. */
export class AuditLogsError extends Error {
  constructor(
    readonly code: AuditLogsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuditLogsError';
  }
}

/**
 * Devuelve la respuesta pública de un error: `status`, `errorCode` y un
 * mensaje genérico. Un error desconocido es siempre un 500.
 */
export function classifyAuditLogsError(error: unknown) {
  const controlled = findAuditLogsError(error);
  const code = controlled
    ? controlled.code
    : CMS_API_ERROR_CODES.AUDIT_LOG_READ_FAILED;

  return { ...RESPONSES[code], errorCode: code };
}

/**
 * Busca un `AuditLogsError` en la cadena de causas: el cliente Drizzle
 * envuelve los errores lanzados dentro de una transacción en otro `Error`
 * con el original en `cause`.
 */
function findAuditLogsError(error: unknown): AuditLogsError | null {
  let current: unknown = error;

  for (let depth = 0; depth < 5 && current; depth++) {
    if (current instanceof AuditLogsError) {
      return current;
    }

    current = current instanceof Error ? current.cause : null;
  }

  return null;
}
