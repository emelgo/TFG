'use client';

import { useState } from 'react';

import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';

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
          <AlertDialogTitle>Impersonate User</AlertDialogTitle>

          <AlertDialogDescription className={'flex flex-col space-y-1'}>
            <span>
              Are you sure you want to impersonate this user? You will be logged
              in as this user. To stop impersonating, log out.
            </span>

            <span>
              <b>NB:</b> If the user has 2FA enabled, you will not be able to
              impersonate them.
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
          <AlertTitle>Error</AlertTitle>

          <AlertDescription>
            Failed to impersonate user. Please check the logs to understand what
            went wrong.
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
                Type <b>CONFIRM</b> to confirm
              </FieldLabel>

              <Input
                id={field.name}
                required
                pattern={'CONFIRM'}
                placeholder={'Type CONFIRM to confirm'}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={isInvalid}
              />

              <FieldDescription>
                Are you sure you want to impersonate this user?
              </FieldDescription>

              <FieldError errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.Field>

      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>

        <Button disabled={mutation.isPending} type={'submit'}>
          {mutation.isPending ? 'Impersonating...' : 'Impersonate User'}
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

  return <LoadingOverlay>Setting up your session...</LoadingOverlay>;
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
