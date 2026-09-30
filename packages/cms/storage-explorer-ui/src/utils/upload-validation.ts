/**
 * Comprobaciones de un fichero antes de subirlo.
 *
 * Evitan enviar un fichero que la API rechazaría (demasiado grande o con un
 * nombre no válido) y dan un mensaje claro al momento. No sustituyen a las de
 * la API, que vuelve a medir el fichero, valida la ruta y decide el tipo de
 * contenido con el que se guarda.
 */
import {
  STORAGE_LIMITS,
  getFileNameError,
} from '@pymekit/cms-shared/storage-paths';

/** Máximo de ficheros por subida desde el diálogo. */
export const MAX_FILES_PER_UPLOAD = 10;

/**
 * Devuelve la clave i18n (relativa a `cms.storageExplorer`) del motivo por el
 * que no se puede subir el fichero, o `null` si se puede.
 */
export function getUploadFileError(file: { name: string; size: number }) {
  if (file.size > STORAGE_LIMITS.maxUploadBytes) {
    return 'errors.fileTooLarge';
  }

  if (getFileNameError(file.name)) {
    return 'errors.invalidFileName';
  }

  return null;
}

/** Tamaño legible (`1.2 MB`). */
export function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) {
    return '-';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(1)} ${units[unit]}`;
}
