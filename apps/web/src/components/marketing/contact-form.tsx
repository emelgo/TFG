'use client';

import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import type { z } from 'zod';

import { CaptchaField } from '@pymekit/auth/captcha/client';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { alertExtras } from '@pymekit/ui/alert-extras';
import { Button } from '@pymekit/ui/button';
import { Field, FieldError, FieldLabel } from '@pymekit/ui/field';
import { Input } from '@pymekit/ui/input';
import { Textarea } from '@pymekit/ui/textarea';
import { Trans } from '@pymekit/ui/trans';

import authConfig from '#/config/auth.config.ts';
import {
  type ContactEmail,
  ContactEmailSchema,
} from '#/lib/contact/contact-email.schema.ts';
import { sendContactEmail } from '#/lib/server/contact.functions.ts';

export function ContactForm() {
  const sendEmail = useServerFn(sendContactEmail);

  const mutation = useMutation({
    mutationFn: (data: ContactEmail) => sendEmail({ data }),
  });

  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
      message: '',
      captchaToken: '',
    } as z.input<typeof ContactEmailSchema>,
    validators: {
      onSubmit: ContactEmailSchema,
    },
    onSubmit: ({ value }) => {
      mutation.mutate(value);
    },
  });

  if (mutation.isSuccess) {
    return <SuccessAlert />;
  }

  if (mutation.isError) {
    return <ErrorAlert />;
  }

  return (
    <form
      className={'flex flex-col space-y-4'}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Field name={'name'}>
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>
                <Trans i18nKey={'marketing.contactName'} />
              </FieldLabel>

              <Input
                id={field.name}
                name={field.name}
                maxLength={200}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={isInvalid}
              />

              <FieldError errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.Field>

      <form.Field name={'email'}>
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>
                <Trans i18nKey={'marketing.contactEmail'} />
              </FieldLabel>

              <Input
                id={field.name}
                name={field.name}
                type={'email'}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={isInvalid}
              />

              <FieldError errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.Field>

      <form.Field name={'message'}>
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>
                <Trans i18nKey={'marketing.contactMessage'} />
              </FieldLabel>

              <Textarea
                id={field.name}
                name={field.name}
                className={'min-h-36'}
                maxLength={5000}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={isInvalid}
              />

              <FieldError errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.Field>

      <form.Field name={'captchaToken'}>
        {(field) => (
          <CaptchaField
            siteKey={authConfig.captchaTokenSiteKey}
            onTokenChange={(token) => field.handleChange(token)}
          />
        )}
      </form.Field>

      <Button disabled={mutation.isPending} type={'submit'}>
        <Trans i18nKey={'marketing.sendMessage'} />
      </Button>
    </form>
  );
}

function SuccessAlert() {
  return (
    <Alert className={alertExtras.success}>
      <AlertTitle>
        <Trans i18nKey={'marketing.contactSuccess'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'marketing.contactSuccessDescription'} />
      </AlertDescription>
    </Alert>
  );
}

function ErrorAlert() {
  return (
    <Alert variant={'destructive'}>
      <AlertTitle>
        <Trans i18nKey={'marketing.contactError'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'marketing.contactErrorDescription'} />
      </AlertDescription>
    </Alert>
  );
}
