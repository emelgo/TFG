/**
 * Pruebas de la lógica de cliente del explorador de almacenamiento: la
 * carpeta de la URL (que escribe cualquiera), las migas de pan, las
 * comprobaciones previas a una subida y los mensajes por código de error.
 */
import { describe, expect, it } from 'vitest';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

import {
  StorageSearchSchema,
  formatBytes,
  getFolderBreadcrumbs,
  getStorageErrorKey,
  getUploadFileError,
  toBucketContentsParams,
  withFolder,
} from '../utils';

describe('StorageSearchSchema', () => {
  it('acepta carpetas válidas', () => {
    expect(StorageSearchSchema.parse({ path: 'e2e/folder' }).path).toBe(
      'e2e/folder',
    );
  });

  it('descarta carpetas con recorrido, absolutas o codificadas', () => {
    for (const path of ['../x', '/etc', 'a/../b', 'a%2F..', 'a//b']) {
      expect(StorageSearchSchema.parse({ path }).path).toBeUndefined();
    }
  });

  it('traduce la URL a los parámetros de la API', () => {
    expect(toBucketContentsParams('account_image', {})).toEqual({
      bucket: 'account_image',
      path: '',
      search: undefined,
      page: undefined,
    });
    expect(
      toBucketContentsParams('b', { path: 'x', page: 2, search: 'png' }),
    ).toEqual({ bucket: 'b', path: 'x', page: 2, search: 'png' });
  });

  it('abrir una carpeta reinicia página y búsqueda', () => {
    expect(withFolder('a/b')).toEqual({
      path: 'a/b',
      page: undefined,
      search: undefined,
    });
    expect(withFolder('').path).toBeUndefined();
  });
});

describe('getFolderBreadcrumbs', () => {
  it('devuelve cada segmento con la ruta a la que lleva', () => {
    expect(getFolderBreadcrumbs('a/b/c')).toEqual([
      { name: 'a', path: 'a' },
      { name: 'b', path: 'a/b' },
      { name: 'c', path: 'a/b/c' },
    ]);
    expect(getFolderBreadcrumbs('')).toEqual([]);
  });
});

describe('comprobaciones previas a la subida', () => {
  it('rechaza ficheros demasiado grandes o con nombres no válidos', () => {
    expect(getUploadFileError({ name: 'a.png', size: 6 * 1024 * 1024 })).toBe(
      'errors.fileTooLarge',
    );
    expect(getUploadFileError({ name: '..png', size: 10 })).toBe(
      'errors.invalidFileName',
    );
    expect(getUploadFileError({ name: 'a%2Fb.png', size: 10 })).toBe(
      'errors.invalidFileName',
    );
    expect(getUploadFileError({ name: 'foto.png', size: 10 })).toBeNull();
  });

  it('formatea tamaños', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(null)).toBe('-');
  });
});

describe('getStorageErrorKey', () => {
  it('elige el mensaje por el código de la API', () => {
    expect(
      getStorageErrorKey(
        { errorCode: CMS_API_ERROR_CODES.STORAGE_ALREADY_EXISTS },
        'fallback',
      ),
    ).toBe('errors.alreadyExists');
    expect(getStorageErrorKey({ status: 403 }, 'fallback')).toBe(
      'errors.permissionDenied',
    );
    expect(getStorageErrorKey(new Error('x'), 'fallback')).toBe('fallback');
  });
});
