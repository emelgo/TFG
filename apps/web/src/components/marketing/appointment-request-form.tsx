'use client';

/**
 * Formulario público «Pedir cita» (escenario de evaluación «Fisioterapia
 * Bahía»).
 *
 * Sigue el mismo patrón que el formulario de contacto de la plataforma:
 * TanStack Form con el esquema Zod compartido, campos de `@pymekit/ui/field`
 * con la ayuda «?» de `@pymekit/ui/field-help`, CAPTCHA opcional y envío con
 * `useServerFn` + `useMutation`. Todos los textos salen de
 * `marketing.appointments` y las etiquetas de los servicios, del enumerado
 * `common.enums.appointment_service`, las mismas que muestra el CMS.
 *
 * [TFG] RNF-01 · CU-07.
 */
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useTranslations } from 'use-intl';
import type { z } from 'zod';

import { CaptchaField } from '@pymekit/auth/captcha/client';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { alertExtras } from '@pymekit/ui/alert-extras';
import { Button } from '@pymekit/ui/button';
import { Checkbox } from '@pymekit/ui/checkbox';
import { Field, FieldError } from '@pymekit/ui/field';
import { FieldLabelWithHelp } from '@pymekit/ui/field-help';
import { Input } from '@pymekit/ui/input';
import { NativeSelect, NativeSelectOption } from '@pymekit/ui/native-select';
import { Textarea } from '@pymekit/ui/textarea';

import authConfig from '#/config/auth.config.ts';
import {
  APPOINTMENT_SERVICES,
  type AppointmentRequest,
  AppointmentRequestSchema,
  MAX_DAYS_AHEAD,
  isoDateFromToday,
} from '#/lib/appointments/appointment-request.schema.ts';
import { submitAppointmentRequestFunction } from '#/lib/appointments/appointment-requests.functions.ts';

type FormValues = z.input<typeof AppointmentRequestSchema>;

/** Campos de texto del formulario: nombre, tipo de `<input>` y longitud. */
const TEXT_FIELDS = [
  { name: 'fullName', type: 'text', maxLength: 150, autoComplete: 'name' },
  { name: 'email', type: 'email', maxLength: 320, autoComplete: 'email' },
  { name: 'phone', type: 'tel', maxLength: 20, autoComplete: 'tel' },
] as const;

export function AppointmentRequestForm() {
  const t = useTranslations('marketing.appointments');
  const tService = useTranslations('common.enums.appointment_service');
  const submit = useServerFn(submitAppointmentRequestFunction);

  const mutation = useMutation({
    mutationFn: (data: AppointmentRequest) => submit({ data }),
  });

  const form = useForm({
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      // Vacío hasta que el visitante elija: el esquema exige un servicio
      service: '' as FormValues['service'],
      preferredDate: '',
      message: '',
      privacyAccepted: false,
      captchaToken: '',
    } as FormValues,
    validators: {
      onSubmit: AppointmentRequestSchema,
    },
    onSubmit: ({ value }) => {
      mutation.mutate(AppointmentRequestSchema.parse(value));
    },
  });

  if (mutation.isSuccess) {
    return (
      <Alert className={alertExtras.success} data-testid="appointment-success">
        <AlertTitle>{t('successTitle')}</AlertTitle>
        <AlertDescription>{t('successDescription')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form
      className={'flex flex-col space-y-4'}
      data-testid="appointment-request-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      {mutation.isError ? (
        <Alert variant={'destructive'} data-testid="appointment-error">
          <AlertTitle>{t('errorTitle')}</AlertTitle>
          <AlertDescription>{t('errorDescription')}</AlertDescription>
        </Alert>
      ) : null}

      {TEXT_FIELDS.map((config) => (
        <form.Field key={config.name} name={config.name}>
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabelWithHelp
                  htmlFor={field.name}
                  help={t(`${config.name}Help`)}
                >
                  {t(config.name)}
                </FieldLabelWithHelp>

                <Input
                  id={field.name}
                  name={field.name}
                  type={config.type}
                  maxLength={config.maxLength}
                  autoComplete={config.autoComplete}
                  data-testid={`appointment-${field.name}`}
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
      ))}

      <form.Field name={'service'}>
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabelWithHelp htmlFor={field.name} help={t('serviceHelp')}>
                {t('service')}
              </FieldLabelWithHelp>

              <NativeSelect
                id={field.name}
                name={field.name}
                className={'w-full'}
                data-testid="appointment-service"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) =>
                  field.handleChange(e.target.value as FormValues['service'])
                }
                aria-invalid={isInvalid}
              >
                <NativeSelectOption value="" disabled>
                  {t('servicePlaceholder')}
                </NativeSelectOption>

                {APPOINTMENT_SERVICES.map((service) => (
                  <NativeSelectOption key={service} value={service}>
                    {tService(service)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>

              <FieldError errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.Field>

      <form.Field name={'preferredDate'}>
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabelWithHelp
                htmlFor={field.name}
                help={t('preferredDateHelp')}
              >
                {t('preferredDate')}
              </FieldLabelWithHelp>

              <Input
                id={field.name}
                name={field.name}
                type={'date'}
                min={isoDateFromToday(0)}
                max={isoDateFromToday(MAX_DAYS_AHEAD)}
                data-testid="appointment-preferredDate"
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
        {(field) => (
          <Field>
            <FieldLabelWithHelp htmlFor={field.name} help={t('messageHelp')}>
              {t('message')}
            </FieldLabelWithHelp>

            <Textarea
              id={field.name}
              name={field.name}
              className={'min-h-28'}
              maxLength={1000}
              data-testid="appointment-message"
              value={field.state.value ?? ''}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />

            <FieldError errors={field.state.meta.errors} />
          </Field>
        )}
      </form.Field>

      <form.Field name={'privacyAccepted'}>
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <div className={'flex items-center gap-2'}>
                <Checkbox
                  id={field.name}
                  data-testid="appointment-privacy"
                  checked={field.state.value === true}
                  onCheckedChange={(checked) =>
                    field.handleChange(checked === true)
                  }
                  aria-invalid={isInvalid}
                />

                <FieldLabelWithHelp
                  htmlFor={field.name}
                  help={t('privacyHelp')}
                  className={'font-normal'}
                >
                  {t('privacy')}
                </FieldLabelWithHelp>
              </div>

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

      <Button
        disabled={mutation.isPending}
        type={'submit'}
        data-testid="appointment-submit"
      >
        {mutation.isPending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
