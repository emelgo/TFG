'use client';

import { useForm } from '@tanstack/react-form';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useSelector } from '@tanstack/react-store';
import * as z from 'zod';

import { useSignInWithOtp } from '@pymekit/supabase/hooks/use-sign-in-with-otp';
import { useVerifyOtp } from '@pymekit/supabase/hooks/use-verify-otp';
import { Button } from '@pymekit/ui/button';
import { Field, FieldDescription, FieldError } from '@pymekit/ui/field';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@pymekit/ui/input-otp';
import { Spinner } from '@pymekit/ui/spinner';
import { Trans } from '@pymekit/ui/trans';

import { useCaptcha } from '../captcha/client';
import { useLastAuthMethod } from '../hooks/use-last-auth-method';
import { AuthErrorAlert } from './auth-error-alert';
import { EmailInput } from './email-input';

const EmailSchema = z.object({ email: z.email() });
const OtpSchema = z.object({ token: z.string().min(6).max(6) });

type OtpSignInContainerProps = {
  shouldCreateUser: boolean;
  captchaSiteKey?: string;
};

export function OtpSignInContainer(props: OtpSignInContainerProps) {
  const verifyMutation = useVerifyOtp();
  const navigate = useNavigate();
  const { recordAuthMethod } = useLastAuthMethod();
  const search = useSearch({ strict: false }) as Record<string, unknown>;

  const shouldCreateUser =
    'shouldCreateUser' in props && props.shouldCreateUser;

  const handleVerifyOtp = async ({
    token,
    email,
  }: {
    token: string;
    email: string;
  }) => {
    await verifyMutation.mutateAsync({
      type: 'email',
      email,
      token,
    });

    // Record successful OTP sign-in
    recordAuthMethod('otp', { email });

    // on sign ups we redirect to the app home
    const next =
      typeof search.next === 'string' && search.next
        ? search.next
        : '/dashboard';

    await navigate({ href: next, replace: true });
  };

  const otpForm = useForm({
    defaultValues: {
      token: '',
      email: '',
    },
    validators: {
      onChange: OtpSchema.merge(EmailSchema),
      onSubmit: OtpSchema.merge(EmailSchema),
    },
    onSubmit: ({ value }) => handleVerifyOtp(value),
  });

  // Only surface validation errors once the user has attempted to submit.
  const otpSubmissionAttempts = useSelector(
    otpForm.store,
    (state) => state.submissionAttempts,
  );

  return (
    <otpForm.Subscribe selector={(state) => state.values.email}>
      {(email) => {
        const isEmailStep = !email;

        if (isEmailStep) {
          return (
            <OtpEmailForm
              shouldCreateUser={shouldCreateUser}
              captchaSiteKey={props.captchaSiteKey}
              onSendOtp={(email) => {
                otpForm.setFieldValue('email', email);
              }}
            />
          );
        }

        return (
          <form
            className="flex w-full flex-col items-center space-y-8"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void otpForm.handleSubmit();
            }}
          >
            <AuthErrorAlert error={verifyMutation.error} />

            <otpForm.Field name="token">
              {(field) => {
                const isInvalid =
                  otpSubmissionAttempts > 0 && !field.state.meta.isValid;

                return (
                  <Field data-invalid={isInvalid}>
                    <InputOTP
                      maxLength={6}
                      value={field.state.value}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      disabled={verifyMutation.isPending}
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

                    <FieldError
                      errors={isInvalid ? field.state.meta.errors : []}
                    />
                  </Field>
                );
              }}
            </otpForm.Field>

            <div className="flex w-full flex-col gap-y-2">
              <Button
                type="submit"
                disabled={verifyMutation.isPending}
                data-testid="otp-verify-button"
              >
                {verifyMutation.isPending ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    <Trans i18nKey="common.otp.verifying" />
                  </>
                ) : (
                  <Trans i18nKey="common.otp.verifyCode" />
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                disabled={verifyMutation.isPending}
                onClick={() => {
                  otpForm.setFieldValue('email', '');
                }}
              >
                <Trans i18nKey="common.otp.requestNewCode" />
              </Button>
            </div>
          </form>
        );
      }}
    </otpForm.Subscribe>
  );
}

function OtpEmailForm({
  shouldCreateUser,
  captchaSiteKey,
  onSendOtp,
}: {
  shouldCreateUser: boolean;
  captchaSiteKey?: string;
  onSendOtp: (email: string) => void;
}) {
  const captcha = useCaptcha({ siteKey: captchaSiteKey });
  const signInMutation = useSignInWithOtp();

  const handleSendOtp = async ({ email }: z.output<typeof EmailSchema>) => {
    await signInMutation.mutateAsync({
      email,
      options: { captchaToken: captcha.token, shouldCreateUser },
    });

    captcha.reset();
    onSendOtp(email);
  };

  const emailForm = useForm({
    defaultValues: { email: '' },
    validators: {
      onChange: EmailSchema,
      onSubmit: EmailSchema,
    },
    onSubmit: ({ value }) => handleSendOtp(value),
  });

  // Only surface validation errors once the user has attempted to submit.
  const emailSubmissionAttempts = useSelector(
    emailForm.store,
    (state) => state.submissionAttempts,
  );

  return (
    <form
      className="flex flex-col gap-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void emailForm.handleSubmit();
      }}
    >
      <AuthErrorAlert error={signInMutation.error} />

      <emailForm.Field name="email">
        {(field) => {
          const isInvalid =
            emailSubmissionAttempts > 0 && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <EmailInput
                data-testid="otp-email-input"
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
      </emailForm.Field>

      {captcha.field}

      <Button
        type="submit"
        disabled={signInMutation.isPending}
        data-testid="otp-send-button"
      >
        {signInMutation.isPending ? (
          <>
            <Spinner className="mr-2 h-4 w-4" />
            <Trans i18nKey="common.otp.sendingCode" />
          </>
        ) : (
          <Trans i18nKey="common.otp.sendVerificationCode" />
        )}
      </Button>
    </form>
  );
}
