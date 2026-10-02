'use client';

import { useState } from 'react';

import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useTranslations } from 'use-intl';

import { useSupabase } from '@pymekit/supabase/hooks/use-supabase';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@pymekit/ui/alert-dialog';
import { Button } from '@pymekit/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@pymekit/ui/field';
import { If } from '@pymekit/ui/if';
import { Input } from '@pymekit/ui/input';
import { LoadingOverlay } from '@pymekit/ui/loading-overlay';
import { Trans } from '@pymekit/ui/trans';

import { impersonateUserFunction } from '../lib/server/admin.functions';
import { ImpersonateUserSchema } from '../lib/server/schema/admin-actions.schema';

type Tokens = {
  accessToken: string;
  refreshToken: string;
};

export function AdminImpersonateUserDialog(
  props: React.PropsWithChildren<{
    userId: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }>,
) {
  const [tokens, setTokens] = useState<Tokens>();

  if (tokens) {
    return <ImpersonateUserAuthSetter tokens={tokens} />;
  }

  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(open) => {
        props.onOpenChange?.(open);
      }}
    >
      <If condition={props.children}>
        <AlertDialogTrigger render={props.children as React.ReactElement} />
      </If>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans i18nKey={'admin.impersonateTitle'} />
          </AlertDialogTitle>

          <AlertDialogDescription className={'flex flex-col space-y-1'}>
            <span>
              <Trans i18nKey={'admin.impersonateDescription'} />
            </span>

            <span>
              <Trans
                i18nKey={'admin.impersonateNote'}
                components={{ b: <b /> }}
              />
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AdminImpersonateUserForm userId={props.userId} onSuccess={setTokens} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AdminImpersonateUserForm(props: {
  userId: string;
  onSuccess: (data: Tokens) => void;
}) {
  const impersonateUser = useServerFn(impersonateUserFunction);

  const t = useTranslations('admin');

  const mutation = useMutation({
    mutationFn: (data: { userId: string; confirmation: string }) =>
      impersonateUser({ data }),
    onSuccess: (data) => {
      if (data) {
        props.onSuccess(data);
      }
    },
  });

  const form = useForm({
    defaultValues: {
      userId: props.userId,
      confirmation: '',
    },
    validators: {
      onChange: ImpersonateUserSchema,
      onSubmit: ImpersonateUserSchema,
    },
    onSubmit: ({ value }) => mutation.mutate(value),
  });

  return (
    <form
      data-testid={'admin-impersonate-user-form'}
      className={'flex flex-col space-y-8'}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <If condition={mutation.isError}>
        <Alert variant={'destructive'}>
          <AlertTitle>
            <Trans i18nKey={'admin.error'} />
          </AlertTitle>

          <AlertDescription>
            <Trans i18nKey={'admin.impersonateError'} />
          </AlertDescription>
        </Alert>
      </If>

      <form.Field name={'confirmation'}>
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>
                <Trans
                  i18nKey={'admin.confirmLabel'}
                  components={{ b: <b /> }}
                />
              </FieldLabel>

              <Input
                id={field.name}
                required
                pattern={'CONFIRM'}
                placeholder={t('confirmPlaceholder')}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={isInvalid}
              />

              <FieldDescription>
                <Trans i18nKey={'admin.impersonateHint'} />
              </FieldDescription>

              <FieldError errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.Field>

      <AlertDialogFooter>
        <AlertDialogCancel>
          <Trans i18nKey={'admin.cancel'} />
        </AlertDialogCancel>

        <Button disabled={mutation.isPending} type={'submit'}>
          {mutation.isPending ? (
            <Trans i18nKey={'admin.impersonating'} />
          ) : (
            <Trans i18nKey={'admin.impersonateTitle'} />
          )}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

function ImpersonateUserAuthSetter({
  tokens,
}: React.PropsWithChildren<{
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}>) {
  useSetSession(tokens);

  return (
    <LoadingOverlay>
      <Trans i18nKey={'admin.settingUpSession'} />
    </LoadingOverlay>
  );
}

function useSetSession(tokens: { accessToken: string; refreshToken: string }) {
  const supabase = useSupabase();

  return useQuery({
    queryKey: ['impersonate-user', tokens.accessToken, tokens.refreshToken],
    gcTime: 0,
    queryFn: async () => {
      await supabase.auth.signOut();

      await supabase.auth.setSession({
        refresh_token: tokens.refreshToken,
        access_token: tokens.accessToken,
      });

      // use a hard refresh to avoid hitting cached pages
      window.location.replace('/dashboard');

      return null;
    },
  });
}
