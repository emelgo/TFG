import { useEffect } from 'react';

import { useMonitoring } from './use-monitoring';

/**
 * @name useCaptureException
 * @description Report an error to the configured monitoring service. Accepts
 * `unknown` because error boundaries can catch any thrown value; non-`Error`
 * values are wrapped so the provider always receives an `Error`. Pass `null`
 * or `undefined` to skip reporting (e.g. when the error has a `digest`,
 * meaning it originated server-side and was already captured by
 * `onRequestError`).
 */
export function useCaptureException(error: unknown) {
  const service = useMonitoring();

  useEffect(() => {
    if (error === null || error === undefined) return;

    void service.captureException(toError(error));
  }, [error, service]);
}

function toError(value: unknown) {
  if (value instanceof Error) {
    return value;
  }

  return new Error(
    typeof value === 'string' ? value : 'Non-Error value thrown',
    { cause: value },
  );
}
