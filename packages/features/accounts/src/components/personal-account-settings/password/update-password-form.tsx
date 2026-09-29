'use client';

import { useState } from 'react';

import type { PostgrestError } from '@supabase/supabase-js';

import { useForm } from '@tanstack/react-form';
import { useSelector } from '@tanstack/react-store';
import { Check, Lock, TriangleAlert, XIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { useUpdateUser } from '@pymekit/supabase/hooks/use-update-user-mutation';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { alertExtras } from '@pymekit/ui/alert-extras';
import { Button } from '@pymekit/ui/button';
import { Field, FieldDescription, FieldError } from '@pymekit/ui/field';
import { If } from '@pymekit/ui/if';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@pymekit/ui/input-group';
import { toast } from '@pymekit/ui/sonner';
import { Trans } from '@pymekit/ui/trans';

import { PasswordUpdateSchema } from '../../../schema/update-password.schema';

export const UpdatePasswordForm = ({
  email,
  callbackPath,
  onSuccess,
}: {
  email: string;
  callbackPath: string;
  onSuccess?: () => void;
}) => {
  const t = useTranslations('account');
  const updateUserMutation = useUpdateUser();
  const [needsReauthentication, setNeedsReauthentication] = useState(false);

  const updatePasswordFromCredential = (password: string) => {
    const redirectTo = [window.location.origin, callbackPath].join('');

    const promise = updateUserMutation
      .mutateAsync({ password, redirectTo })
      .then(onSuccess)
      .catch((error) => {
        if (
          typeof error === 'string' &&
          error?.includes('Password update requires reauthentication')
        ) {
          setNeedsReauthentication(true);
        } else {
          throw error;
        }
      });

    toast
      .promise(() => promise, {
        success: t(`updatePasswordSuccess`),
        error: t(`updatePasswordError`),
        loading: t(`updatePasswordLoading`),
      })
      .unwrap();
  };

  const updatePasswordCallback = async ({
    newPassword,
  }: {
    newPassword: string;
  }) => {
    // if the user does not have an email assigned, it's possible they
    // don't have an email/password factor linked, and the UI is out of sync
    if (!email) {
      return Promise.reject(t(`cannotUpdatePassword`));
    }

    updatePasswordFromCredential(newPassword);
  };

  const Schema = PasswordUpdateSchema.withTranslation(t('passwordNotMatching'));

  const form = useForm({
    defaultValues: {
      newPassword: '',
      repeatPassword: '',
    },
    validators: {
      onChange: Schema,
      onSubmit: Schema,
    },
    onSubmit: ({ value }) => updatePasswordCallback(value),
  });

  // Only surface validation errors once the user has attempted to submit.
  const submissionAttempts = useSelector(
    form.store,
    (state) => state.submissionAttempts,
  );

  return (
    <form
      data-testid="identity-form"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <div className={'flex flex-col space-y-4'}>
        <If condition={updateUserMutation.data}>
          <SuccessAlert />
        </If>

        <If condition={updateUserMutation.error}>
          {(error) => <ErrorAlert error={error as PostgrestError} />}
        </If>

        <If condition={needsReauthentication}>
          <NeedsReauthenticationAlert />
        </If>

        <div className="flex flex-col space-y-2">
          <form.Field name={'newPassword'}>
            {(field) => {
              const isInvalid =
                submissionAttempts > 0 && !field.state.meta.isValid;

              return (
                <Field data-invalid={isInvalid}>
                  <InputGroup className="dark:bg-background">
                    <InputGroupAddon align="inline-start">
                      <Lock className="h-4 w-4" />
                    </InputGroupAddon>

                    <InputGroupInput
                      data-testid={'account-password-form-password-input'}
                      autoComplete={'new-password'}
                      required
                      type={'password'}
                      placeholder={t('newPassword')}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                    />
                  </InputGroup>

                  <FieldError
                    errors={isInvalid ? field.state.meta.errors : []}
                  />
                </Field>
              );
            }}
          </form.Field>

          <form.Field name={'repeatPassword'}>
            {(field) => {
              const isInvalid =
                submissionAttempts > 0 && !field.state.meta.isValid;

              return (
                <Field data-invalid={isInvalid}>
                  <InputGroup className="dark:bg-background">
                    <InputGroupAddon align="inline-start">
                      <Lock className="h-4 w-4" />
                    </InputGroupAddon>

                    <InputGroupInput
                      data-testid={
                        'account-password-form-repeat-password-input'
                      }
                      required
                      type={'password'}
                      placeholder={t('repeatPassword')}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                    />
                  </InputGroup>

                  <FieldDescription>
                    <Trans i18nKey={'account.repeatPasswordDescription'} />
                  </FieldDescription>

                  <FieldError
                    errors={isInvalid ? field.state.meta.errors : []}
                  />
                </Field>
              );
            }}
          </form.Field>
        </div>

        <div>
          <Button
            type="submit"
            disabled={updateUserMutation.isPending}
            data-testid="identity-form-submit"
          >
            <Trans i18nKey={'account.updatePasswordSubmitLabel'} />
          </Button>
        </div>
      </div>
    </form>
  );
};

function ErrorAlert({ error }: { error: { code: string } }) {
  const t = useTranslations();

  return (
    <Alert variant={'destructive'}>
      <XIcon className={'h-4'} />

      <AlertTitle>
        <Trans i18nKey={'account.updatePasswordError'} />
      </AlertTitle>

      <AlertDescription>
        <Trans
          i18nKey={`auth.errors.${error.code}`}
          defaults={t('auth.resetPasswordError')}
        />
      </AlertDescription>
    </Alert>
  );
}

function SuccessAlert() {
  return (
    <Alert className={alertExtras.success}>
      <Check className={'h-4'} />

      <AlertTitle>
        <Trans i18nKey={'account.updatePasswordSuccess'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'account.updatePasswordSuccessMessage'} />
      </AlertDescription>
    </Alert>
  );
}

function NeedsReauthenticationAlert() {
  return (
    <Alert className={alertExtras.warning}>
      <TriangleAlert className={'h-4'} />

      <AlertTitle>
        <Trans i18nKey={'account.needsReauthentication'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'account.needsReauthenticationDescription'} />
      </AlertDescription>
    </Alert>
  );
}
