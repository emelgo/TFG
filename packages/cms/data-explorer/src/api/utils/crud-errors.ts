/**
 * Traducción de los errores de escritura del explorador de datos a
 * respuestas HTTP seguras.
 *
 * Las funciones SQL de escritura (`cms.insert_record`, `cms.update_record*`,
 * `cms.delete_record*`) no lanzan excepciones: capturan cualquier error y
 * devuelven `{ success: false, error, meta: { sqlstate } }`. El texto de
 * `error` es el de PostgreSQL (nombres de tablas, columnas, restricciones y a
 * veces el valor enviado), así que **nunca** se devuelve al cliente. En su
 * lugar se clasifica el fallo por su SQLSTATE en un código estable
 * (`CMS_API_ERROR_CODES.RECORD_*`) con su estado HTTP y un mensaje genérico,
 * y el texto original solo va al *log* del servidor.
 *
 * Particularidades de las funciones heredadas que se tienen en cuenta:
 *
 *  - Algunas relanzan el error dentro de otro mensaje sin conservar el
 *    SQLSTATE (queda `P0001`, `raise_exception`) pero lo escriben al final:
 *    «… (SQLSTATE: 23505)». Se recupera de ahí.
 *  - «Registro no encontrado» se devuelve sin SQLSTATE o con `P0001`; se
 *    reconoce por el mensaje, que escriben las propias funciones.
 *
 * Es una función pura para poder probarla sin base de datos.
 *
 * [TFG] RNF-02 Seguridad: los errores de la base de datos no se filtran al
 * cliente; ver Memoria §Diseño > Seguridad del CMS.
 */
import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

/** Resultado de clasificar un error de escritura. */
export type CrudErrorClassification = {
  status: 400 | 403 | 404 | 409 | 500;
  errorCode:
    | typeof CMS_API_ERROR_CODES.RECORD_PERMISSION_DENIED
    | typeof CMS_API_ERROR_CODES.RECORD_NOT_FOUND
    | typeof CMS_API_ERROR_CODES.RECORD_DUPLICATE
    | typeof CMS_API_ERROR_CODES.RECORD_REFERENCE_VIOLATION
    | typeof CMS_API_ERROR_CODES.RECORD_INVALID_DATA
    | typeof CMS_API_ERROR_CODES.RECORD_RULE_VIOLATION
    | typeof CMS_API_ERROR_CODES.RECORD_WRITE_FAILED;
  /** Mensaje genérico, seguro para el cliente (la interfaz lo traduce). */
  message: string;
};

/**
 * Error que lanza el servicio cuando una función SQL de escritura responde
 * `success: false`. Conserva el SQLSTATE para poder clasificarlo; su
 * `message` es el texto interno de PostgreSQL y solo debe ir al *log*.
 */
export class CrudOperationError extends Error {
  readonly sqlstate: string | undefined;

  constructor(message: string, sqlstate?: string) {
    super(message);
    this.name = 'CrudOperationError';
    this.sqlstate = sqlstate;
  }
}

const SQLSTATE_IN_MESSAGE = /\(SQLSTATE: ([0-9A-Z]{5})\)/;

const NOT_FOUND_MESSAGES = [
  'record not found',
  'no record found',
  'no records found',
];

const RESPONSES = {
  permission: {
    status: 403,
    errorCode: CMS_API_ERROR_CODES.RECORD_PERMISSION_DENIED,
    message: 'You do not have permission to perform this action',
  },
  notFound: {
    status: 404,
    errorCode: CMS_API_ERROR_CODES.RECORD_NOT_FOUND,
    message: 'The record was not found',
  },
  duplicate: {
    status: 409,
    errorCode: CMS_API_ERROR_CODES.RECORD_DUPLICATE,
    message: 'A record with these values already exists',
  },
  reference: {
    status: 409,
    errorCode: CMS_API_ERROR_CODES.RECORD_REFERENCE_VIOLATION,
    message:
      'The operation conflicts with a related record (it references a missing record or other records depend on it)',
  },
  invalid: {
    status: 400,
    errorCode: CMS_API_ERROR_CODES.RECORD_INVALID_DATA,
    message: 'The submitted data is not valid for this table',
  },
  rule: {
    status: 400,
    errorCode: CMS_API_ERROR_CODES.RECORD_RULE_VIOLATION,
    message: 'A rule of this table rejected the change',
  },
  failed: {
    status: 500,
    errorCode: CMS_API_ERROR_CODES.RECORD_WRITE_FAILED,
    message: 'The record could not be saved. Please try again later',
  },
} as const satisfies Record<string, CrudErrorClassification>;

/**
 * Devuelve el SQLSTATE efectivo de un error: el que trae la respuesta de la
 * función o, si es el genérico `P0001`, el que aparece escrito en el
 * mensaje («… (SQLSTATE: 23505)»).
 */
export function getEffectiveSqlState(
  sqlstate: string | undefined,
  message: string,
) {
  if (sqlstate && sqlstate !== 'P0001') {
    return sqlstate;
  }

  return message.match(SQLSTATE_IN_MESSAGE)?.[1] ?? sqlstate;
}

/**
 * Clasifica un error de escritura (normalmente un `CrudOperationError`) en
 * estado HTTP, código estable y mensaje genérico.
 */
export function classifyCrudError(error: unknown): CrudErrorClassification {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  const sqlstate = getEffectiveSqlState(
    error instanceof CrudOperationError ? error.sqlstate : undefined,
    message,
  );

  // El «no encontrado» de las funciones no lleva un SQLSTATE propio.
  if (
    sqlstate === 'P0002' ||
    NOT_FOUND_MESSAGES.some((text) => lowerMessage.includes(text))
  ) {
    return RESPONSES.notFound;
  }

  if (sqlstate === '42501' || lowerMessage.includes('permission denied')) {
    return RESPONSES.permission;
  }

  if (sqlstate === '23505') {
    return RESPONSES.duplicate;
  }

  if (sqlstate === '23503') {
    return RESPONSES.reference;
  }

  // 23xxx: resto de restricciones (not null, check, exclusión); 22xxx:
  // datos con formato o rango no válido; 42703: columna inexistente;
  // 428C9: valor en una columna generada.
  if (
    sqlstate &&
    (sqlstate.startsWith('23') ||
      sqlstate.startsWith('22') ||
      sqlstate === '42703' ||
      sqlstate === '428C9')
  ) {
    return RESPONSES.invalid;
  }

  // `P0001` (`raise_exception`) sin otro SQLSTATE detrás: lo lanza una regla
  // de la tabla, normalmente un *trigger* que prohíbe el cambio (por
  // ejemplo, `public.notifications` solo deja cambiar `dismissed`). Los
  // «no encontrado» y «sin permiso» de las funciones del CMS, que también
  // usan `P0001`, ya se han reconocido arriba por su mensaje.
  if (sqlstate === 'P0001') {
    return RESPONSES.rule;
  }

  return RESPONSES.failed;
}
