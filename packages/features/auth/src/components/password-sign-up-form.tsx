'use client';

import type React from 'react';

import { useForm } from '@tanstack/react-form';
import { useSelector } from '@tanstack/react-store';
import { ArrowRight } from 'lucide-react';

import { Button } from '@pymekit/ui/button';
import { Field, FieldDescription, FieldError } from '@pymekit/ui/field';
import { If } from '@pymekit/ui/if';
import { Trans } from '@pymekit/ui/trans';

import { PasswordSignUpSchema } from '../schemas/password-sign-up.schema';
import { EmailInput } from './email-input';
import { PasswordInput } from './password-input';
import { TermsAndConditionsFormField } from './terms-and-conditions-form-field';

interface PasswordSignUpFormProps {
  defaultValues?: {
    email: string;
  };

  displayTermsCheckbox?: boolean;

  onSubmit: (params: {
    email: string;
    password: string;
    repeatPassword: string;
  }) => unknown;

  loading: boolean;
  captchaLoading: boolean;
  captchaField?: React.ReactNode;
}

export function PasswordSignUpForm({
  defaultValues,
  displayTermsCheckbox,
  onSubmit,
  loading,
  captchaLoading,
  captchaField,
}: PasswordSignUpFormProps) {
  const form = useForm({
    defaultValues: {
      email: defaultValues?.email ?? '',
      password: '',
      repeatPassword: '',
    },
    validators: {
      onChange: PasswordSignUpSchema,
      onSubmit: PasswordSignUpSchema,
    },
    onSubmit: ({ value }) => {
      onSubmit(value);
    },
  });

  // Only surface validation errors once the user has attempted to submit.
  const submissionAttempts = useSelector(
    form.store,
    (state) => state.submissionAttempts,
  );

  return (
    <form
      className={'flex w-full flex-col gap-y-4'}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <div className={'flex flex-col gap-y-1.5'}>
        <form.Field name={'email'}>
          {(field) => {
            const isInvalid =
              submissionAttempts > 0 && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <EmailInput
                  data-testid={'email-input'}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                />

                <FieldError errors={isInvalid ? field.state.meta.errors : []} />
              </Field>
            );
          }}
        </form.Field>

        <form.Field name={'password'}>
          {(field) => {
            const isInvalid =
              submissionAttempts > 0 && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <PasswordInput
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                />

                <FieldError errors={isInvalid ? field.state.meta.errors : []} />
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
                <PasswordInput
                  data-testid={'repeat-password-input'}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                />

                <FieldDescription>
                  <Trans i18nKey={'auth.repeatPasswordDescription'} />
                </FieldDescription>

                <FieldError errors={isInvalid ? field.state.meta.errors : []} />
              </Field>
            );
          }}
        </form.Field>
      </div>

      <If condition={displayTermsCheckbox}>
        <TermsAndConditionsFormField />
      </If>

      {captchaField}

      <Button
        data-testid={'auth-submit-button'}
        className={'w-full'}
        type="submit"
        disabled={loading || captchaLoading}
      >
        <If condition={captchaLoading}>
          <span className={'animate-in fade-in slide-in-from-bottom-24'}>
            <Trans i18nKey={'auth.verifyingCaptcha'} />
          </span>
        </If>

        <If condition={loading && !captchaLoading}>
          <span className={'animate-in fade-in slide-in-from-bottom-24'}>
            <Trans i18nKey={'auth.signingUp'} />
          </span>
        </If>

        <If condition={!loading && !captchaLoading}>
          <span
            className={
              'animate-in fade-in slide-in-from-bottom-24 flex items-center'
            }
          >
            <Trans i18nKey={'auth.signUpWithEmail'} />

            <ArrowRight
              className={
                'zoom-in animate-in slide-in-from-left-2 fill-mode-both h-4 gap-2 delay-500 duration-500'
              }
            />
          </span>
        </If>
      </Button>
    </form>
  );
}
