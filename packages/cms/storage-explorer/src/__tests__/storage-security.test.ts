/**
 * Pruebas de las piezas de seguridad del explorador de almacenamiento que no
 * necesitan base de datos: validación de rutas en el servidor, tipo de
 * contenido de las subidas y traducción de errores a códigos estables.
 */
import { describe, expect, it } from 'vitest';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

import {
  validateBatchFilePaths,
  validateBucketName,
  validateFileName,
  validateFilePath,
  validateFolderPath,
} from '../utils/path-security';
import {
  StorageError,
  classifyStorageError,
  fromStorageApiError,
} from '../utils/storage-errors';
import {
  SAFE_BINARY_CONTENT_TYPE,
  getUploadContentType,
  sniffImageContentType,
} from '../utils/upload-content-type';

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const HTML_BYTES = new TextEncoder().encode('<html><script>alert(1)</script>');
const SVG_BYTES = new TextEncoder().encode('<svg onload="alert(1)"/>');

/** Devuelve el código del `StorageError` que lanza `fn`, o `null`. */
function codeOf(fn: () => void) {
  try {
    fn();

    return null;
  } catch (error) {
    return error instanceof StorageError ? error.code : 'unexpected';
  }
}

describe('validación de rutas en el servidor', () => {
  it('rechaza el recorrido de directorios y las rutas absolutas con 400', () => {
    for (const path of ['../x', 'a/../b', '/a', 'a%2F..%2Fb', 'a//b']) {
      expect(codeOf(() => validateFilePath(path))).toBe(
        CMS_API_ERROR_CODES.STORAGE_INVALID_PATH,
      );
    }
  });

  it('acepta rutas relativas normales y la raíz como carpeta', () => {
    expect(codeOf(() => validateFilePath('e2e/a.png'))).toBeNull();
    expect(codeOf(() => validateFolderPath(''))).toBeNull();
  });

  it('rechaza nombres de fichero con barras y buckets con barras', () => {
    expect(codeOf(() => validateFileName('a/b.png'))).toBe(
      CMS_API_ERROR_CODES.STORAGE_INVALID_PATH,
    );
    expect(codeOf(() => validateBucketName('account_image/../x'))).toBe(
      CMS_API_ERROR_CODES.STORAGE_INVALID_PATH,
    );
    expect(codeOf(() => validateBucketName('account_image'))).toBeNull();
  });

  it('limita y deduplica las operaciones múltiples', () => {
    expect(codeOf(() => validateBatchFilePaths([]))).toBe(
      CMS_API_ERROR_CODES.STORAGE_INVALID_PATH,
    );
    expect(
      codeOf(() =>
        validateBatchFilePaths(Array.from({ length: 21 }, (_, i) => `f${i}`)),
      ),
    ).toBe(CMS_API_ERROR_CODES.STORAGE_TOO_MANY_FILES);
    expect(codeOf(() => validateBatchFilePaths(['a', 'a']))).toBe(
      CMS_API_ERROR_CODES.STORAGE_INVALID_PATH,
    );
  });
});

describe('tipo de contenido de las subidas', () => {
  it('reconoce las firmas de PNG y JPEG', () => {
    expect(sniffImageContentType(PNG_BYTES)).toBe('image/png');
    expect(sniffImageContentType(JPEG_BYTES)).toBe('image/jpeg');
    expect(sniffImageContentType(HTML_BYTES)).toBeNull();
  });

  it('guarda como imagen solo si extensión y contenido coinciden', () => {
    expect(getUploadContentType('foto.png', PNG_BYTES)).toBe('image/png');
    expect(getUploadContentType('foto.jpg', JPEG_BYTES)).toBe('image/jpeg');
  });

  it('guarda como binario un HTML disfrazado de imagen', () => {
    expect(getUploadContentType('foto.png', HTML_BYTES)).toBe(
      SAFE_BINARY_CONTENT_TYPE,
    );
    // Una extensión de imagen con otro formato real tampoco pasa.
    expect(getUploadContentType('foto.png', JPEG_BYTES)).toBe(
      SAFE_BINARY_CONTENT_TYPE,
    );
  });

  it('nunca guarda HTML ni SVG con su tipo activo', () => {
    expect(getUploadContentType('pagina.html', HTML_BYTES)).toBe(
      SAFE_BINARY_CONTENT_TYPE,
    );
    expect(getUploadContentType('logo.svg', SVG_BYTES)).toBe(
      SAFE_BINARY_CONTENT_TYPE,
    );
  });
});

describe('traducción de errores', () => {
  it('un error desconocido es un 500 sin detalles', () => {
    const result = classifyStorageError(
      new Error('relation "storage.objects" does not exist'),
    );

    expect(result.status).toBe(500);
    expect(result.errorCode).toBe(CMS_API_ERROR_CODES.STORAGE_OPERATION_FAILED);
    expect(result.message).not.toContain('storage.objects');
  });

  it('un permiso denegado es un 403 que no revela la ruta', () => {
    const result = classifyStorageError(
      StorageError.permissionDenied('Storage delete denied on secret/x.png'),
    );

    expect(result.status).toBe(403);
    expect(result.message).not.toContain('secret');
  });

  it('traduce los errores de la API de Storage', () => {
    expect(
      fromStorageApiError({ message: 'Object not found' }, 'move').code,
    ).toBe(CMS_API_ERROR_CODES.STORAGE_NOT_FOUND);
    expect(
      fromStorageApiError({ message: 'The resource already exists' }, 'up')
        .code,
    ).toBe(CMS_API_ERROR_CODES.STORAGE_ALREADY_EXISTS);
    expect(fromStorageApiError({ message: 'boom' }, 'up').code).toBe(
      CMS_API_ERROR_CODES.STORAGE_OPERATION_FAILED,
    );
  });
});
