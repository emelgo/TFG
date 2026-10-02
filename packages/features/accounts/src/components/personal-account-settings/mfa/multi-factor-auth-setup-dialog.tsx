'use client';

import { useCallback, useState } from 'react';

import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useSelector } from '@tanstack/react-store';
import { ArrowLeftIcon, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'use-intl';
import * as z from 'zod';

import { useSupabase } from '@pymekit/supabase/hooks/use-supabase';
import { useFactorsMutationKey } from '@pymekit/supabase/hooks/use-user-factors-mutation-key';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { Button } from '@pymekit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@pymekit/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@pymekit/ui/field';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { If } from '@pymekit/ui/if';
import { Input } from '@pymekit/ui/input';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@pymekit/ui/input-otp';
import { toast } from '@pymekit/ui/sonner';
import { Trans } from '@pymekit/ui/trans';

import { refreshAuthSession } from '../../../server/personal-accounts.functions';

const VerificationCodeSchema = z.object({
  factorId: z.string().min(1),
  verificationCode: z.string().min(6).max(6),
});

const FactorSchema = z.object({
  factorName: z.string().min(1),
  qrCode: z.string().min(1),
});

const FactorNameSchema = z.object({
  name: z.string().min(1),
});

export function MultiFactorAuthSetupDialog(props: { userId: string }) {
  const t = useTranslations();
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog();

  const onEnrollSuccess = useCallback(() => {
    setIsPending(false);
    setOpen(false);

    return toast.success(t(`account.multiFactorSetupSuccess` as never));
  }, [t, setIsPending, setOpen]);

  return (
    <Dialog {...dialogProps}>
      <DialogTrigger
        render={
          <Button>
            <Trans i18nKey={'account.setupMfaButtonLabel'} />
          </Button>
        }
      />

      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>
            <Trans i18nKey={'account.setupMfaButtonLabel'} />
          </DialogTitle>

          <DialogDescription>
            <Trans i18nKey={'account.multiFactorAuthDescription'} />
          </DialogDescription>
        </DialogHeader>

        <div>
          <MultiFactorAuthSetupForm
            userId={props.userId}
            isPending={isPending}
            setIsPending={setIsPending}
            onCancel={() => setOpen(false)}
            onEnrolled={onEnrollSuccess}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MultiFactorAuthSetupForm({
  onEnrolled,
  onCancel,
  userId,
  isPending,
  setIsPending,
}: React.PropsWithChildren<{
  userId: string;
  onCancel: () => void;
  onEnrolled: () => void;
  isPending: boolean;
  setIsPending: (pending: boolean) => void;
}>) {
  const verifyCodeMutation = useVerifyCodeMutation(userId);
  const refreshSession = useServerFn(refreshAuthSession);

  const [error, setError] = useState('');

  const verificationCodeForm = useForm({
    defaultValues: {
      factorId: '',
      verificationCode: '',
    },
    validators: {
      onChange: VerificationCodeSchema,
      onSubmit: VerificationCodeSchema,
    },
    onSubmit: async ({ value }) => {
      setIsPending(true);
      setError('');

      try {
        await verifyCodeMutation.mutateAsync({
          factorId: value.factorId,
          code: value.verificationCode,
        });

        await refreshSession();

        onEnrolled();
      } catch (error) {
        const message = (error as Error).message || `Unknown error`;

        setIsPending(false);
        setError(message);
      }
    },
  });

  // Only surface validation errors once the user has attempted to submit.
  const submissionAttempts = useSelector(
    verificationCodeForm.store,
    (state) => state.submissionAttempts,
  );

  if (error) {
    return <ErrorAlert />;
  }

  return (
    <div className={'flex flex-col space-y-4'}>
      <div className={'flex justify-center'}>
        <FactorQrCode
          userId={userId}
          isPending={isPending}
          onCancel={onCancel}
          onSetFactorId={(factorId) =>
            verificationCodeForm.setFieldValue('factorId', factorId)
          }
        />
      </div>

      <verificationCodeForm.Subscribe
        selector={(state) => state.values.factorId}
      >
        {(factorId) => (
          <If condition={factorId}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void verificationCodeForm.handleSubmit();
              }}
              className={'w-full'}
            >
              <div className={'flex flex-col space-y-8'}>
                <verificationCodeForm.Field name={'verificationCode'}>
                  {(field) => {
                    const isInvalid =
                      submissionAttempts > 0 && !field.state.meta.isValid;

                    return (
                      <Field
                        className={
                          'mx-auto flex flex-col items-center justify-center'
                        }
                        data-invalid={isInvalid}
                      >
                        <InputOTP
                          // Centra las casillas: `Field` estira el contenedor a todo el ancho.
                          containerClassName="justify-center"
                          maxLength={6}
                          minLength={6}
                          value={field.state.value}
                          onChange={field.handleChange}
                          onBlur={field.handleBlur}
                          aria-invalid={isInvalid}
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                          </InputOTPGroup>
                          <InputOTPSeparator />
                          <InputOTPGroup>
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>

                        <FieldDescription>
                          <Trans
                            i18nKey={'account.verifyActivationCodeDescription'}
                          />
                        </FieldDescription>

                        <FieldError
                          errors={isInvalid ? field.state.meta.errors : []}
                        />
                      </Field>
                    );
                  }}
                </verificationCodeForm.Field>

                <div className={'flex justify-end space-x-2'}>
                  <Button
                    type={'button'}
                    variant={'ghost'}
                    disabled={isPending}
                    onClick={onCancel}
                  >
                    <Trans i18nKey={'common.cancel'} />
                  </Button>

                  <verificationCodeForm.Subscribe
                    selector={(state) => state.canSubmit}
                  >
                    {(canSubmit) => (
                      <Button
                        disabled={!canSubmit || isPending}
                        type={'submit'}
                      >
                        {isPending ? (
                          <Trans i18nKey={'account.verifyingCode'} />
                        ) : (
                          <Trans i18nKey={'account.enableMfaFactor'} />
                        )}
                      </Button>
                    )}
                  </verificationCodeForm.Subscribe>
                </div>
              </div>
            </form>
          </If>
        )}
      </verificationCodeForm.Subscribe>
    </div>
  );
}

function FactorQrCode({
  onSetFactorId,
  onCancel,
  userId,
  isPending,
}: React.PropsWithChildren<{
  userId: string;
  isPending: boolean;
  onCancel: () => void;
  onSetFactorId: (factorId: string) => void;
}>) {
  const enrollFactorMutation = useEnrollFactor(userId);
  const t = useTranslations();
  const [error, setError] = useState<string>('');

  const form = useForm({
    defaultValues: {
      factorName: '',
      qrCode: '',
    },
    validators: {
      onChange: FactorSchema,
      onSubmit: FactorSchema,
    },
  });

  if (error) {
    return (
      <div className={'flex w-full flex-col space-y-2'}>
        <Alert variant={'destructive'}>
          <TriangleAlert className={'h-4'} />

          <AlertTitle>
            <Trans i18nKey={'account.qrCodeErrorHeading'} />
          </AlertTitle>

          <AlertDescription>
            <Trans
              i18nKey={`auth.errors.${error}`}
              defaults={t('account.qrCodeErrorDescription')}
            />
          </AlertDescription>
        </Alert>

        <div>
          <Button variant={'outline'} onClick={onCancel}>
            <ArrowLeftIcon className={'h-4'} />
            <Trans i18nKey={`common.retry`} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form.Subscribe
      selector={(state) => ({
        factorName: state.values.factorName,
        qrCode: state.values.qrCode,
      })}
    >
      {({ factorName, qrCode }) => {
        if (!factorName) {
          return (
            <FactorNameForm
              isPending={isPending}
              onCancel={onCancel}
              onSetFactorName={async (name) => {
                const response = await enrollFactorMutation.mutateAsync(name);

                if (!response.success) {
                  return setError(response.data as string);
                }

                const data = response.data;

                if (data.type === 'totp') {
                  form.setFieldValue('factorName', name);
                  form.setFieldValue('qrCode', data.totp.qr_code);
                }

                // dispatch event to set factor ID
                onSetFactorId(data.id);
              }}
            />
          );
        }

        return (
          <div
            className={
              'dark:bg-secondary flex flex-col space-y-4 rounded-lg border p-4'
            }
          >
            <p>
              <span className={'text-muted-foreground text-sm'}>
                <Trans i18nKey={'account.multiFactorModalHeading'} />
              </span>
            </p>

            <div className={'flex justify-center'}>
              <QrImage src={qrCode} />
            </div>
          </div>
        );
      }}
    </form.Subscribe>
  );
}

function FactorNameForm(
  props: React.PropsWithChildren<{
    isPending: boolean;
    onSetFactorName: (name: string) => void;
    onCancel: () => void;
  }>,
) {
  const form = useForm({
    defaultValues: {
      name: '',
    },
    validators: {
      onChange: FactorNameSchema,
      onSubmit: FactorNameSchema,
    },
    onSubmit: ({ value }) => {
      props.onSetFactorName(value.name);
    },
  });

  // Only surface validation errors once the user has attempted to submit.
  const submissionAttempts = useSelector(
    form.store,
    (state) => state.submissionAttempts,
  );

  return (
    <form
      className={'w-full'}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <div className={'flex flex-col space-y-4'}>
        <form.Field name={'name'}>
          {(field) => {
            const isInvalid =
              submissionAttempts > 0 && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>
                  <Trans i18nKey={'account.factorNameLabel'} />
                </FieldLabel>

                <Input
                  id={field.name}
                  autoComplete={'off'}
                  required
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                />

                <FieldDescription>
                  <Trans i18nKey={'account.factorNameHint'} />
                </FieldDescription>

                <FieldError errors={isInvalid ? field.state.meta.errors : []} />
              </Field>
            );
          }}
        </form.Field>

        <div className={'flex justify-end space-x-2'}>
          <Button
            type={'button'}
            variant={'ghost'}
            disabled={props.isPending}
            onClick={props.onCancel}
          >
            <Trans i18nKey={'common.cancel'} />
          </Button>

          <Button type={'submit'} disabled={props.isPending}>
            <Trans i18nKey={'account.factorNameSubmitLabel'} />
          </Button>
        </div>
      </div>
    </form>
  );
}

function QrImage({ src }: { src: string }) {
  return (
    <img
      alt={'QR Code'}
      src={src}
      width={160}
      height={160}
      className={'bg-white p-2'}
    />
  );
}

function useEnrollFactor(userId: string) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const mutationKey = useFactorsMutationKey(userId);

  const mutationFn = async (factorName: string) => {
    const response = await client.auth.mfa.enroll({
      friendlyName: factorName,
      factorType: 'totp',
      issuer: import.meta.env.VITE_PRODUCT_NAME,
    });

    if (response.error) {
      return {
        success: false as const,
        data: response.error.code,
      };
    }

    return {
      success: true as const,
      data: response.data,
    };
  };

  return useMutation({
    mutationFn,
    mutationKey,
    onSuccess() {
      return queryClient.refetchQueries({
        queryKey: mutationKey,
      });
    },
  });
}

function useVerifyCodeMutation(userId: string) {
  const mutationKey = useFactorsMutationKey(userId);
  const client = useSupabase();
  const queryClient = useQueryClient();

  const mutationFn = async (params: { factorId: string; code: string }) => {
    const challenge = await client.auth.mfa.challenge({
      factorId: params.factorId,
    });

    if (challenge.error) {
      throw challenge.error;
    }

    const challengeId = challenge.data.id;

    const verify = await client.auth.mfa.verify({
      factorId: params.factorId,
      code: params.code,
      challengeId,
    });

    if (verify.error) {
      throw verify.error;
    }

    return verify;
  };

  return useMutation({
    mutationKey,
    mutationFn,
    onSuccess: () => {
      return queryClient.refetchQueries({ queryKey: mutationKey });
    },
  });
}

function ErrorAlert() {
  return (
    <Alert variant={'destructive'}>
      <TriangleAlert className={'h-4'} />

      <AlertTitle>
        <Trans i18nKey={'account.multiFactorSetupErrorHeading'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'account.multiFactorSetupErrorDescription'} />
      </AlertDescription>
    </Alert>
  );
}
