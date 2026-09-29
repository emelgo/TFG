import { TriangleAlert } from 'lucide-react';

import type {
  WeakPasswordError,
  WeakPasswordReason,
} from '@pymekit/supabase/hooks/use-sign-up-with-email-password';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { Trans } from '@pymekit/ui/trans';

function isWeakPasswordError(error: unknown): error is WeakPasswordError {
  return error instanceof Error && error.name === 'WeakPasswordError';
}

/**
 * @name AuthErrorAlert
 * @param error This error comes from Supabase as the code returned on errors
 * This error is mapped from the translation auth:errors.{error}
 * To update the error messages, please update the translation file
 * https://github.com/supabase/gotrue-js/blob/master/src/lib/errors.ts
 * @constructor
 */
export function AuthErrorAlert({
  error,
}: {
  error: Error | null | undefined | string;
}) {
  if (!error) {
    return null;
  }

  // Handle weak password errors specially
  if (isWeakPasswordError(error)) {
    return <WeakPasswordErrorAlert reasons={error.reasons} />;
  }

  const DefaultError = <Trans i18nKey="auth.errors.default" />;

  const errorCode =
    error instanceof Error
      ? 'code' in error && typeof error.code === 'string'
        ? error.code
        : error.message
      : error;

  return (
    <Alert variant={'destructive'}>
      <TriangleAlert className={'w-4'} />

      <AlertTitle>
        <Trans i18nKey={`auth.errorAlertHeading`} />
      </AlertTitle>

      <AlertDescription data-testid={'auth-error-message'}>
        <Trans i18nKey={`auth.errors.${errorCode}`} defaults={DefaultError} />
      </AlertDescription>
    </Alert>
  );
}

function WeakPasswordErrorAlert({
  reasons,
}: {
  reasons: WeakPasswordReason[];
}) {
  return (
    <Alert variant={'destructive'}>
      <TriangleAlert className={'w-4'} />

      <AlertTitle>
        <Trans i18nKey={'auth.errors.weakPassword.title'} />
      </AlertTitle>

      <AlertDescription data-testid={'auth-error-message'}>
        <Trans i18nKey={'auth.errors.weakPassword.description'} />

        {reasons.length > 0 && (
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
            {reasons.map((reason) => (
              <li key={reason}>
                <Trans
                  i18nKey={`auth.errors.weakPassword.reasons.${reason}`}
                  defaults={reason}
                />
              </li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}
