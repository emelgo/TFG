/**
 * Validación de nombres y rutas en el servidor del explorador de
 * almacenamiento.
 *
 * Las reglas son las de `@pymekit/cms-shared/storage-paths` (compartidas con
 * la interfaz); aquí se convierten en excepciones tipadas (`StorageError`
 * con `STORAGE_INVALID_PATH`) para que las rutas Hono respondan 400 con un
 * código estable. Se llaman **antes** de comprobar permisos y de usar el
 * cliente de servicio: la ruta que se autoriza tiene que ser exactamente la
 * ruta sobre la que se actúa.
 */
import {
  STORAGE_LIMITS,
  getFileNameError,
  getFilePathError,
  isValidBucketName,
  isValidFolderPath,
} from '@pymekit/cms-shared/storage-paths';

import { StorageError } from './storage-errors';

/** Exige un nombre de *bucket* válido. */
export function validateBucketName(bucket: string): void {
  if (!isValidBucketName(bucket)) {
    throw StorageError.invalidPath(`Invalid bucket name`);
  }
}

/** Exige un nombre de fichero o carpeta (un solo segmento) válido. */
export function validateFileName(fileName: string): void {
  const error = getFileNameError(fileName);

  if (error) {
    throw StorageError.invalidPath(`Invalid file name (${error})`);
  }
}

/** Exige una ruta de objeto válida (relativa, sin `..` ni codificaciones). */
export function validateFilePath(filePath: string): void {
  const error = getFilePathError(filePath);

  if (error) {
    throw StorageError.invalidPath(`Invalid file path (${error})`);
  }
}

/** Exige una carpeta válida para listar (la raíz `''` o una ruta válida). */
export function validateFolderPath(folderPath: string): void {
  if (!isValidFolderPath(folderPath)) {
    throw StorageError.invalidPath('Invalid folder path');
  }
}

/**
 * Valida las rutas de una operación múltiple: número de elementos, cada ruta
 * y que no se repitan.
 */
export function validateBatchFilePaths(
  filePaths: string[],
  maxCount: number = STORAGE_LIMITS.maxBatchSize,
): void {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    throw StorageError.invalidPath('At least one file path is required');
  }

  if (filePaths.length > maxCount) {
    throw StorageError.tooManyFiles();
  }

  for (const filePath of filePaths) {
    validateFilePath(filePath);
  }

  if (new Set(filePaths).size !== filePaths.length) {
    throw StorageError.invalidPath('Duplicate file paths');
  }
}
