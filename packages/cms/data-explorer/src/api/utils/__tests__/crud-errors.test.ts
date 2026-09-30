/**
 * Pruebas de la clasificación de los errores de escritura del explorador de
 * datos: cada SQLSTATE de las funciones `cms.*_record*` debe acabar en su
 * estado HTTP y código estable, sin devolver nunca el texto de PostgreSQL.
 */
import { describe, expect, it } from 'vitest';

import {
  CrudOperationError,
  classifyCrudError,
  getEffectiveSqlState,
} from '../crud-errors';

describe('getEffectiveSqlState', () => {
  it('usa el SQLSTATE de la respuesta si es específico', () => {
    expect(getEffectiveSqlState('23505', 'duplicate key')).toBe('23505');
  });

  it('recupera el SQLSTATE escrito en el mensaje cuando llega P0001', () => {
    expect(
      getEffectiveSqlState(
        'P0001',
        'Error updating record: duplicate key value (SQLSTATE: 23505)',
      ),
    ).toBe('23505');
  });

  it('devuelve el original si el mensaje no lo incluye', () => {
    expect(getEffectiveSqlState('P0001', 'Invalid admin access')).toBe('P0001');
    expect(getEffectiveSqlState(undefined, 'boom')).toBeUndefined();
  });
});

describe('classifyCrudError', () => {
  const classify = (message: string, sqlstate?: string) =>
    classifyCrudError(new CrudOperationError(message, sqlstate));

  it('permiso denegado → 403', () => {
    expect(classify('Permission denied for insert', '42501')).toMatchObject({
      status: 403,
      errorCode: 'RECORD_PERMISSION_DENIED',
    });

    // `_update_record_impl` lanza «Permission denied» sin SQLSTATE propio.
    expect(classify('Permission denied', 'P0001').status).toBe(403);
  });

  it('registro inexistente → 404', () => {
    expect(classify('Record not found.').status).toBe(404);
    expect(
      classify('Delete failed: No records found matching the conditions')
        .status,
    ).toBe(404);
    expect(
      classify('No record found matching the specified conditions', 'P0001')
        .errorCode,
    ).toBe('RECORD_NOT_FOUND');
  });

  it('valor único repetido → 409 duplicado', () => {
    expect(classify('Unique constraint violation', '23505')).toMatchObject({
      status: 409,
      errorCode: 'RECORD_DUPLICATE',
    });

    expect(
      classify('Error updating record: dup (SQLSTATE: 23505)', 'P0001').status,
    ).toBe(409);
  });

  it('clave foránea → 409 de referencia', () => {
    expect(classify('Foreign key violation', '23503')).toMatchObject({
      status: 409,
      errorCode: 'RECORD_REFERENCE_VIOLATION',
    });

    expect(
      classify('Error deleting record: fk (SQLSTATE: 23503)', 'P0001')
        .errorCode,
    ).toBe('RECORD_REFERENCE_VIOLATION');
  });

  it('datos no válidos → 400', () => {
    for (const sqlstate of ['23502', '23514', '22P02', '22023', '42703']) {
      expect(classify('invalid', sqlstate)).toMatchObject({
        status: 400,
        errorCode: 'RECORD_INVALID_DATA',
      });
    }
  });

  it('una regla de la tabla (trigger con RAISE EXCEPTION) → 400', () => {
    expect(
      classify(
        'Error updating record: UPDATE of columns other than "dismissed" is forbidden (SQLSTATE: P0001)',
        'P0001',
      ),
    ).toMatchObject({ status: 400, errorCode: 'RECORD_RULE_VIOLATION' });
  });

  it('cualquier otro error → 500 genérico', () => {
    expect(classify('connection reset')).toMatchObject({
      status: 500,
      errorCode: 'RECORD_WRITE_FAILED',
    });

    expect(classifyCrudError(new Error('boom')).status).toBe(500);
    expect(classifyCrudError('boom').status).toBe(500);
  });

  it('auditoría fallida (PKA01, F2.7a) → 500 genérico, no un error de datos', () => {
    expect(classify('Audit log write failed', 'PKA01')).toMatchObject({
      status: 500,
      errorCode: 'RECORD_WRITE_FAILED',
    });
  });

  it('nunca devuelve el texto interno de PostgreSQL', () => {
    const internal =
      'duplicate key value violates unique constraint "accounts_slug_key"';
    const result = classify(internal, '23505');

    expect(result.message).not.toContain('accounts_slug_key');
    expect(result.message).not.toContain('SQLSTATE');
  });
});
