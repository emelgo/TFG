/**
 * Pruebas de la clasificación de errores de acceso de la API del CMS: de
 * ella depende que el *layout* `/admin/cms` redirija al inicio de sesión,
 * muestre el aviso de MFA o responda con un 404.
 */
import { describe, expect, it } from 'vitest';

import { ApiError } from '@pymekit/cms-api/client';
import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';

import { getCmsAccessFailure, shouldRetryCmsQuery } from '../errors';

describe('getCmsAccessFailure', () => {
  it('trata un 401 como sesión ausente', () => {
    const error = new ApiError('no session', { status: 401 });

    expect(getCmsAccessFailure(error)).toBe('unauthenticated');
  });

  it('distingue el 403 de MFA o cuenta inactiva por su errorCode', () => {
    const error = new ApiError('mfa', {
      status: 403,
      errorCode: CMS_API_ERROR_CODES.MFA_OR_INACTIVE_ACCOUNT,
    });

    expect(getCmsAccessFailure(error)).toBe('mfa_or_inactive');
  });

  it('trata cualquier otro 403 como prohibido', () => {
    const noClaim = new ApiError('no access', {
      status: 403,
      errorCode: CMS_API_ERROR_CODES.NO_CMS_ACCESS,
    });
    const noCode = new ApiError('forbidden', { status: 403 });

    expect(getCmsAccessFailure(noClaim)).toBe('forbidden');
    expect(getCmsAccessFailure(noCode)).toBe('forbidden');
  });

  it('no clasifica errores que no son de acceso', () => {
    expect(
      getCmsAccessFailure(new ApiError('boom', { status: 500 })),
    ).toBeNull();
    expect(getCmsAccessFailure(new Error('network'))).toBeNull();
  });
});

describe('shouldRetryCmsQuery', () => {
  it('no reintenta los errores 4xx', () => {
    const error = new ApiError('forbidden', { status: 403 });

    expect(shouldRetryCmsQuery(0, error)).toBe(false);
  });

  it('reintenta hasta dos veces los errores de servidor o red', () => {
    const error = new ApiError('boom', { status: 500 });

    expect(shouldRetryCmsQuery(0, error)).toBe(true);
    expect(shouldRetryCmsQuery(1, new Error('network'))).toBe(true);
    expect(shouldRetryCmsQuery(2, error)).toBe(false);
  });
});
