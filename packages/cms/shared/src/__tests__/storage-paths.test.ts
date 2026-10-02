/**
 * Pruebas de las reglas de rutas del explorador de almacenamiento.
 *
 * Son la primera barrera antes de usar el cliente de servicio de Storage:
 * cada caso de *path traversal* o de codificación que se acepte aquí llegaría
 * a una operación que ignora RLS.
 */
import { describe, expect, it } from 'vitest';

import {
  STORAGE_LIMITS,
  getFileNameError,
  getFilePathError,
  getParentPath,
  getStorageFileType,
  isValidBucketName,
  isValidFilePath,
  isValidFolderPath,
  joinStoragePath,
} from '../utils/storage-paths';

describe('getFilePathError', () => {
  it('acepta rutas relativas normales', () => {
    expect(getFilePathError('avatar.png')).toBeNull();
    expect(getFilePathError('e2e/folder/avatar.png')).toBeNull();
    expect(getFilePathError('carpeta con espacios/foto (1).jpg')).toBeNull();
  });

  it('rechaza el recorrido de directorios', () => {
    expect(getFilePathError('../secret.png')).toBe('traversal');
    expect(getFilePathError('a/../../b')).toBe('traversal');
    expect(getFilePathError('a/./b')).toBe('traversal');
    expect(getFilePathError('a/..')).toBe('traversal');
  });

  it('rechaza rutas absolutas y de unidad', () => {
    expect(getFilePathError('/etc/passwd')).toBe('absolute');
    expect(getFilePathError('C:/Windows')).toBe('absolute');
  });

  it('rechaza barras y puntos codificados', () => {
    expect(getFilePathError('a%2F..%2Fb')).not.toBeNull();
    expect(getFilePathError('a%2Fb')).toBe('invalid_characters');
    expect(getFilePathError('%2e%2e/b')).toBe('invalid_characters');
    expect(getFilePathError('a\\b')).toBe('invalid_characters');
  });

  it('rechaza caracteres que cortan la URL o de control', () => {
    expect(getFilePathError('a?b=1')).toBe('invalid_characters');
    expect(getFilePathError('a#b')).toBe('invalid_characters');
    expect(getFilePathError('a\u0000b')).toBe('invalid_characters');
  });

  it('rechaza segmentos vacíos', () => {
    expect(getFilePathError('')).toBe('empty');
    expect(getFilePathError('a//b')).toBe('empty');
    expect(getFilePathError('a/')).toBe('empty');
  });

  it('rechaza rutas y nombres demasiado largos', () => {
    expect(getFilePathError('a/'.repeat(600) + 'b')).toBe('too_long');
    expect(getFileNameError('a'.repeat(STORAGE_LIMITS.maxNameLength + 1))).toBe(
      'too_long',
    );
  });

  it('rechaza nombres reservados y terminados en punto o espacio', () => {
    expect(getFileNameError('CON.txt')).toBe('reserved_name');
    expect(getFileNameError('nombre.')).toBe('trailing_dot_or_space');
    expect(getFileNameError('nombre ')).toBe('trailing_dot_or_space');
  });
});

describe('isValidFolderPath', () => {
  it('acepta la raíz y carpetas válidas', () => {
    expect(isValidFolderPath('')).toBe(true);
    expect(isValidFolderPath('e2e/folder')).toBe(true);
  });

  it('rechaza carpetas con recorrido', () => {
    expect(isValidFolderPath('..')).toBe(false);
    expect(isValidFilePath('a/../b')).toBe(false);
  });
});

describe('isValidBucketName', () => {
  it('acepta nombres de bucket de Supabase', () => {
    expect(isValidBucketName('account_image')).toBe(true);
    expect(isValidBucketName('public-assets.v2')).toBe(true);
  });

  it('rechaza nombres que cambiarían la URL de Storage', () => {
    expect(isValidBucketName('')).toBe(false);
    expect(isValidBucketName('..')).toBe(false);
    expect(isValidBucketName('a/b')).toBe(false);
    expect(isValidBucketName('a%2Fb')).toBe(false);
    expect(isValidBucketName('.hidden')).toBe(false);
  });
});

describe('utilidades de rutas', () => {
  it('une y separa carpetas', () => {
    expect(joinStoragePath('', 'a.png')).toBe('a.png');
    expect(joinStoragePath('x/y', 'a.png')).toBe('x/y/a.png');
    expect(getParentPath('x/y/a.png')).toBe('x/y');
    expect(getParentPath('a.png')).toBe('');
  });

  it('clasifica los ficheros por extensión y nunca trata SVG como imagen', () => {
    expect(getStorageFileType('foto.PNG')).toBe('image');
    expect(getStorageFileType('logo.svg')).toBe('code');
    expect(getStorageFileType('pagina.html')).toBe('code');
    expect(getStorageFileType('informe.pdf')).toBe('document');
    expect(getStorageFileType('sin-extension')).toBe('file');
    expect(getStorageFileType('.env')).toBe('file');
  });
});
