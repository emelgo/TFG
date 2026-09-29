'use client';

import { useForm } from '@tanstack/react-form';
import { useSelector } from '@tanstack/react-store';
import { Check, Mail } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { useUpdateUser } from '@pymekit/supabase/hooks/use-update-user-mutation';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { alertExtras } from '@pymekit/ui/alert-extras';
import { Button } from '@pymekit/ui/button';
import { Field, FieldError } from '@pymekit/ui/field';
import { If } from '@pymekit/ui/if';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@pymekit/ui/input-group';
import { toast } from '@pymekit/ui/sonner';
import { Trans } from '@pymekit/ui/trans';

import { UpdateEmailSchema } from '../../../schema/update-email.schema';

function createEmailSchema(
  currentEmail: string | null,
  emailsNotMatchingMessage: string,
  emailNotChangedMessage: string,
) {
  const schema = UpdateEmailSchema.withTranslation(emailsNotMatchingMessage);

  // If there's a current email, ensure the new email is different
  if (currentEmail) {
    return schema.refine(
      (data) => {
        return data.email !== currentEmail;
      },
      {
        path: ['email'],
        message: emailNotChangedMessage,
      },
    );
  }

  // If no current email, just validate the schema
  return schema;
}

export function UpdateEmailForm({
  email,
  callbackPath,
  onSuccess,
}: {
  email?: string | null;
  callbackPath: string;
  onSuccess?: () => void;
}) {
  const t = useTranslations('account');
  const updateUserMutation = useUpdateUser();
  const isSettingEmail = !email;

  const Schema = createEmailSchema(
    email ?? null,
    t('emailNotMatching'),
    t('emailNotChanged'),
  );

  const form = useForm({
    defaultValues: {
      email: '',
      repeatEmail: '',
    },
    validators: {
      onChange: Schema,
      onSubmit: Schema,
    },
    onSubmit: ({ value }) => {
      const promise = async () => {
        const redirectTo = new URL(
          callbackPath,
          window.location.origin,
        ).toString();

        await updateUserMutation.mutateAsync({
          email: value.email,
          redirectTo,
        });

        if (onSuccess) {
          onSuccess();
        }
      };

      toast.promise(promise, {
        success: t(isSettingEmail ? 'setEmailSuccess' : 'updateEmailSuccess'),
        loading: t(isSettingEmail ? 'setEmailLoading' : 'updateEmailLoading'),
        error: t(isSettingEmail ? 'setEmailError' : 'updateEmailError'),
      });
    },
  });

  // Only surface validation errors once the user has attempted to submit.
  const submissionAttempts = useSelector(
    form.store,
    (state) => state.submissionAttempts,
  );

  return (
    <form
      className={'flex flex-col space-y-4'}
      data-testid={'account-email-form'}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <If condition={updateUserMutation.data}>
        <Alert className={alertExtras.success}>
          <Check className={'h-4'} />

          <AlertTitle>
            <Trans
              i18nKey={
                isSettingEmail
                  ? 'account.setEmailSuccess'
                  : 'account.updateEmailSuccess'
              }
            />
          </AlertTitle>

          <AlertDescription>
            <Trans
              i18nKey={
                isSettingEmail
                  ? 'account.setEmailSuccessMessage'
                  : 'account.updateEmailSuccessMessage'
              }
            />
          </AlertDescription>
        </Alert>
      </If>

      <div className={'flex flex-col space-y-4'}>
        <div className="flex flex-col space-y-2">
          <form.Field name={'email'}>
            {(field) => {
              const isInvalid =
                submissionAttempts > 0 && !field.state.meta.isValid;

              return (
                <Field data-invalid={isInvalid}>
                  <InputGroup className="dark:bg-background">
                    <InputGroupAddon align="inline-start">
                      <Mail className="h-4 w-4" />
                    </InputGroupAddon>

                    <InputGroupInput
                      data-testid={'account-email-form-email-input'}
                      required
                      type={'email'}
                      placeholder={t(
                        isSettingEmail ? 'emailAddress' : 'newEmail',
                      )}
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

          <form.Field name={'repeatEmail'}>
            {(field) => {
              const isInvalid =
                submissionAttempts > 0 && !field.state.meta.isValid;

              return (
                <Field data-invalid={isInvalid}>
                  <InputGroup className="dark:bg-background">
                    <InputGroupAddon align="inline-start">
                      <Mail className="h-4 w-4" />
                    </InputGroupAddon>

                    <InputGroupInput
                      data-testid={'account-email-form-repeat-email-input'}
                      required
                      type={'email'}
                      placeholder={t('repeatEmail')}
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
        </div>

        <div>
          <Button type="submit" disabled={updateUserMutation.isPending}>
            <Trans
              i18nKey={
                isSettingEmail
                  ? 'account.setEmailAddress'
                  : 'account.updateEmailSubmitLabel'
              }
            />
          </Button>
        </div>
      </div>
    </form>
  );
}
