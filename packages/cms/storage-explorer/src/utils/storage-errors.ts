/**
 * Errores del explorador de almacenamiento y su traducción a respuestas HTTP.
 *
 * El servicio lanza `StorageError` con un código estable
 * (`CMS_API_ERROR_CODES.STORAGE_*`); cualquier otro error (de Supabase
 * Storage, de la red, de PostgreSQL) se trata como fallo interno. Las rutas
 * Hono llaman a `classifyStorageError` y responden con el estado y un mensaje
 * genérico: el texto original, que puede nombrar rutas, *buckets* o tablas
 * internas, solo va al *log* del servidor.
 *
 * Es código puro para poder probarlo sin Hono ni Supabase.
 *
 * [TFG] RNF-02 Seguridad: los errores internos no llegan al cliente.
 */
import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

type StorageErrorCode =
  | typeof CMS_API_ERROR_CODES.STORAGE_PERMISSION_DENIED
  | typeof CMS_API_ERROR_CODES.STORAGE_INVALID_PATH
  | typeof CMS_API_ERROR_CODES.STORAGE_NOT_FOUND
  | typeof CMS_API_ERROR_CODES.STORAGE_ALREADY_EXISTS
  | typeof CMS_API_ERROR_CODES.STORAGE_FILE_TOO_LARGE
  | typeof CMS_API_ERROR_CODES.STORAGE_TOO_MANY_FILES
  | typeof CMS_API_ERROR_CODES.STORAGE_OPERATION_FAILED;

/** Respuesta pública de cada código: estado HTTP y mensaje genérico. */
const RESPONSES: Record<
  StorageErrorCode,
  { status: 400 | 403 | 404 | 409 | 413 | 500; message: string }
> = {
  STORAGE_PERMISSION_DENIED: {
    status: 403,
    message: 'You do not have permission to perform this storage action',
  },
  STORAGE_INVALID_PATH: {
    status: 400,
    message: 'The bucket, path or file name is not valid',
  },
  STORAGE_NOT_FOUND: {
    status: 404,
    message: 'The file or folder was not found',
  },
  STORAGE_ALREADY_EXISTS: {
    status: 409,
    message: 'A file or folder with this name already exists',
  },
  STORAGE_FILE_TOO_LARGE: {
    status: 413,
    message: 'The file is larger than the maximum upload size',
  },
  STORAGE_TOO_MANY_FILES: {
    status: 400,
    message: 'Too many files in a single operation',
  },
  STORAGE_OPERATION_FAILED: {
    status: 500,
    message: 'The storage operation failed. Please try again later',
  },
};

/**
 * Error controlado del explorador. Su `message` es para el *log*; al cliente
 * solo llega el mensaje genérico de su código.
 */
export class StorageError extends Error {
  constructor(
    readonly code: StorageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StorageError';
  }

  static permissionDenied(detail = 'Storage permission denied') {
    return new StorageError(
      CMS_API_ERROR_CODES.STORAGE_PERMISSION_DENIED,
      detail,
    );
  }

  static invalidPath(detail = 'Invalid storage path') {
    return new StorageError(CMS_API_ERROR_CODES.STORAGE_INVALID_PATH, detail);
  }

  static notFound(detail = 'Storage object not found') {
    return new StorageError(CMS_API_ERROR_CODES.STORAGE_NOT_FOUND, detail);
  }

  static alreadyExists(detail = 'Storage object already exists') {
    return new StorageError(CMS_API_ERROR_CODES.STORAGE_ALREADY_EXISTS, detail);
  }

  static fileTooLarge(detail = 'File too large') {
    return new StorageError(CMS_API_ERROR_CODES.STORAGE_FILE_TOO_LARGE, detail);
  }

  static tooManyFiles(detail = 'Too many files') {
    return new StorageError(CMS_API_ERROR_CODES.STORAGE_TOO_MANY_FILES, detail);
  }

  static failed(detail: string) {
    return new StorageError(
      CMS_API_ERROR_CODES.STORAGE_OPERATION_FAILED,
      detail,
    );
  }
}

/**
 * Traduce un error de Supabase Storage (`{ message, statusCode? }`) a un
 * `StorageError`. Storage responde 404 o «not found» si el objeto no existe y
 * 409 o «already exists»/«Duplicate» si el destino ya existe; el resto es un
 * fallo interno.
 */
export function fromStorageApiError(
  error: { message?: string; statusCode?: string | number } | null | undefined,
  context: string,
) {
  const message = error?.message ?? 'Unknown storage error';
  const status = String(error?.statusCode ?? '');
  const lower = message.toLowerCase();

  if (status === '404' || lower.includes('not found')) {
    return StorageError.notFound(`${context}: ${message}`);
  }

  if (
    status === '409' ||
    lower.includes('already exists') ||
    lower.includes('duplicate')
  ) {
    return StorageError.alreadyExists(`${context}: ${message}`);
  }

  if (status === '413' || lower.includes('exceeded the maximum')) {
    return StorageError.fileTooLarge(`${context}: ${message}`);
  }

  return StorageError.failed(`${context}: ${message}`);
}

/**
 * Devuelve la respuesta pública de un error: `status`, `errorCode` y un
 * mensaje genérico. Un error desconocido es siempre un 500.
 */
export function classifyStorageError(error: unknown) {
  const code =
    error instanceof StorageError
      ? error.code
      : CMS_API_ERROR_CODES.STORAGE_OPERATION_FAILED;

  const { status, message } = RESPONSES[code];

  return { status, errorCode: code, message };
}
