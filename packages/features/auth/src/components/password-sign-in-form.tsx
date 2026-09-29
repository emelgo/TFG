'use client';

import type React from 'react';

import { useForm } from '@tanstack/react-form';
import { Link } from '@tanstack/react-router';
import { useSelector } from '@tanstack/react-store';
import { ArrowRight, Mail } from 'lucide-react';
import { useTranslations } from 'use-intl';
import type { z } from 'zod';

import { Button } from '@pymekit/ui/button';
import { Field, FieldError } from '@pymekit/ui/field';
import { If } from '@pymekit/ui/if';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@pymekit/ui/input-group';
import { Trans } from '@pymekit/ui/trans';

import { PasswordSignInSchema } from '../schemas/password-sign-in.schema';
import { PasswordInput } from './password-input';

export function PasswordSignInForm({
  onSubmit,
  captchaLoading = false,
  loading = false,
  redirecting = false,
  captchaField,
}: {
  onSubmit: (params: z.output<typeof PasswordSignInSchema>) => unknown;
  captchaLoading: boolean;
  loading: boolean;
  redirecting: boolean;
  captchaField?: React.ReactNode;
}) {
  const t = useTranslations('auth');

  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
    validators: {
      onChange: PasswordSignInSchema,
      onSubmit: PasswordSignInSchema,
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
      className={'flex w-full flex-col gap-y-2'}
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
                <InputGroup className="dark:bg-background">
                  <InputGroupAddon>
                    <Mail className="h-4 w-4" />
                  </InputGroupAddon>

                  <InputGroupInput
                    data-testid={'email-input'}
                    required
                    type="email"
                    placeholder={t('emailPlaceholder')}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                  />
                </InputGroup>

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

                <div>
                  <Button
                    nativeButton={false}
                    render={<Link to={'/auth/password-reset'} />}
                    type={'button'}
                    size={'sm'}
                    variant={'link'}
                    className={'p-0 text-xs'}
                  >
                    <Trans i18nKey={'auth.passwordForgottenQuestion'} />
                  </Button>
                </div>
              </Field>
            );
          }}
        </form.Field>
      </div>

      {captchaField}

      <Button
        data-testid="auth-submit-button"
        className={'group w-full'}
        type="submit"
        disabled={loading || redirecting || captchaLoading}
      >
        <If condition={redirecting}>
          <span className={'animate-in fade-in slide-in-from-bottom-24'}>
            <Trans i18nKey={'auth.redirecting'} />
          </span>
        </If>

        <If condition={loading}>
          <span className={'animate-in fade-in slide-in-from-bottom-24'}>
            <Trans i18nKey={'auth.signingIn'} />
          </span>
        </If>

        <If condition={captchaLoading && !redirecting}>
          <span className={'animate-in fade-in slide-in-from-bottom-24'}>
            <Trans i18nKey={'auth.verifyingCaptcha'} />
          </span>
        </If>

        <If condition={!redirecting && !loading && !captchaLoading}>
          <span
            className={
              'animate-in fade-in slide-in-from-bottom-24 flex items-center gap-1'
            }
          >
            <Trans i18nKey={'auth.signInWithEmail'} />

            <ArrowRight
              className={
                'zoom-in animate-in slide-in-from-left-2 fill-mode-both h-4 delay-500 duration-500'
              }
            />
          </span>
        </If>
      </Button>
    </form>
  );
}
