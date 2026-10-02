/**
 * Pruebas de la elección del mensaje de error de una escritura a partir del
 * código estable de la API (nunca del texto).
 */
import { describe, expect, it } from 'vitest';

import { getWriteErrorKey } from '../utils/write-errors';

describe('getWriteErrorKey', () => {
  it('traduce los códigos conocidos', () => {
    expect(
      getWriteErrorKey({ errorCode: 'RECORD_DUPLICATE' }, 'fallback'),
    ).toBe('record.errors.duplicate');
    expect(getWriteErrorKey({ errorCode: 'ALREADY_LINKED' }, 'fallback')).toBe(
      'record.errors.alreadyLinked',
    );
  });

  it('un 403 sin código es «sin permiso»', () => {
    expect(getWriteErrorKey({ status: 403 }, 'fallback')).toBe(
      'record.errors.permissionDenied',
    );
  });

  it('lo desconocido usa el mensaje genérico', () => {
    expect(getWriteErrorKey(new Error('boom'), 'fallback')).toBe('fallback');
    expect(getWriteErrorKey({ errorCode: 'X', status: 500 }, 'fallback')).toBe(
      'fallback',
    );
  });
});
