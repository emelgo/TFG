'use client';

import { useState } from 'react';

import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { TriangleAlert } from 'lucide-react';
import * as z from 'zod';

import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { Button } from '@pymekit/ui/button';
import { Field, FieldDescription, FieldError } from '@pymekit/ui/field';
import { If } from '@pymekit/ui/if';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@pymekit/ui/input-otp';
import { Spinner } from '@pymekit/ui/spinner';
import { Trans } from '@pymekit/ui/trans';

import { sendOtpEmailFunction } from '../server/otp.functions';

// Email form schema
const SendOtpSchema = z.object({
  email: z.string().email({ message: 'common.validation.invalidEmail' }),
});

// OTP verification schema
const VerifyOtpSchema = z.object({
  otp: z.string().min(6, { message: 'common.validation.invalidOtp' }).max(6),
});

type VerifyOtpFormProps = {
  // Purpose of the OTP (e.g., 'email-verification', 'password-reset')
  purpose: string;
  // Callback when OTP is successfully verified
  onSuccess: (otp: string) => void;
  // Email address to send the OTP to
  email: string;
  // Customize form appearance
  className?: string;
  // Optional cancel button
  CancelButton?: React.ReactNode;
};

export function VerifyOtpForm({
  purpose,
  email,
  className,
  CancelButton,
  onSuccess,
}: VerifyOtpFormProps) {
  // Track the current step (email entry or OTP verification)
  const [step, setStep] = useState<'email' | 'otp'>('email');

  // Track errors
  const [error, setError] = useState<string | null>(null);

  const sendOtpEmail = useServerFn(sendOtpEmailFunction);

  const sendOtpMutation = useMutation({
    mutationFn: (input: { purpose: string; email: string }) =>
      sendOtpEmail({ data: input }),
    onSuccess: (data) => {
      if (data?.success) {
        setStep('otp');
        setError(null);
      } else {
        // El detalle técnico del servidor no se enseña: se muestra un
        // mensaje genérico en español (clave i18n).
        setError('common.genericServerError');
      }
    },
    onError: () => {
      setError('common.genericServerError');
    },
  });

  const isPending = sendOtpMutation.isPending;

  // Handle sending OTP email
  const handleSendOtp = () => {
    setError(null);

    sendOtpMutation.mutate({
      purpose,
      email,
    });
  };

  // Handle OTP verification
  const handleVerifyOtp = (data: z.output<typeof VerifyOtpSchema>) => {
    onSuccess(data.otp);
  };

  // Email form
  const emailForm = useForm({
    defaultValues: {
      email,
    },
    validators: {
      onSubmit: SendOtpSchema,
    },
    onSubmit: () => {
      handleSendOtp();
    },
  });

  // OTP verification form
  const otpForm = useForm({
    defaultValues: {
      otp: '',
    },
    validators: {
      onChange: VerifyOtpSchema,
      onSubmit: VerifyOtpSchema,
    },
    onSubmit: ({ value }) => {
      handleVerifyOtp(value);
    },
  });

  return (
    <div className={className}>
      {step === 'email' ? (
        <form
          className="flex flex-col gap-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            void emailForm.handleSubmit();
          }}
        >
          <div className="flex flex-col gap-y-2">
            <p className="text-muted-foreground text-sm">
              <Trans
                i18nKey="common.otp.requestVerificationCodeDescription"
                values={{ email }}
              />
            </p>
          </div>

          <If condition={Boolean(error)}>
            <Alert variant="destructive">
              <TriangleAlert className="h-4 w-4" />

              <AlertTitle>
                <Trans i18nKey="common.otp.errorSendingCode" />
              </AlertTitle>

              <AlertDescription>
                <Trans i18nKey={error ?? undefined} />
              </AlertDescription>
            </Alert>
          </If>

          <div className="flex w-full justify-end gap-2">
            {CancelButton}

            <Button
              type="submit"
              disabled={isPending}
              data-testid="otp-send-verification-button"
            >
              {isPending ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  <Trans i18nKey="common.otp.sendingCode" />
                </>
              ) : (
                <Trans i18nKey="common.otp.sendVerificationCode" />
              )}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex w-full flex-col items-center gap-y-8">
          <div className="text-muted-foreground text-sm">
            <Trans i18nKey="common.otp.codeSentToEmail" values={{ email }} />
          </div>

          <form
            className="flex w-full flex-col items-center space-y-8"
            onSubmit={(e) => {
              e.preventDefault();
              void otpForm.handleSubmit();
            }}
          >
            <If condition={Boolean(error)}>
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />

                <AlertTitle>
                  <Trans i18nKey="common.error" />
                </AlertTitle>

                <AlertDescription>
                  <Trans i18nKey={error ?? undefined} />
                </AlertDescription>
              </Alert>
            </If>

            <otpForm.Field name="otp">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;

                return (
                  <Field data-invalid={isInvalid} className="items-center">
                    <InputOTP
                      // Centra las casillas: `Field` estira el contenedor a todo el ancho.
                      containerClassName="justify-center"
                      maxLength={6}
                      value={field.state.value}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      disabled={isPending}
                      data-testid="otp-input"
                      aria-invalid={isInvalid}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} data-slot="0" />
                        <InputOTPSlot index={1} data-slot="1" />
                        <InputOTPSlot index={2} data-slot="2" />
                      </InputOTPGroup>
                      <InputOTPSeparator />
                      <InputOTPGroup>
                        <InputOTPSlot index={3} data-slot="3" />
                        <InputOTPSlot index={4} data-slot="4" />
                        <InputOTPSlot index={5} data-slot="5" />
                      </InputOTPGroup>
                    </InputOTP>

                    <FieldDescription>
                      <Trans i18nKey="common.otp.enterCodeFromEmail" />
                    </FieldDescription>

                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                );
              }}
            </otpForm.Field>

            <div className="flex w-full justify-between gap-2">
              {CancelButton}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => setStep('email')}
                >
                  <Trans i18nKey="common.otp.requestNewCode" />
                </Button>

                <Button
                  type="submit"
                  disabled={isPending}
                  data-testid="otp-verify-button"
                >
                  {isPending ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      <Trans i18nKey="common.otp.verifying" />
                    </>
                  ) : (
                    <Trans i18nKey="common.otp.verifyCode" />
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
