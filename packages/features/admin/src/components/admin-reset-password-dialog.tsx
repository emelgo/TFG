'use client';

import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import * as z from 'zod';

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
import { toast } from '@pymekit/ui/sonner';

import { resetPasswordFunction } from '../lib/server/admin.functions';

const FormSchema = z.object({
  userId: z.uuid(),
  confirmation: z.custom<string>((value) => value === 'CONFIRM'),
});

export function AdminResetPasswordDialog(props: {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.children && (
        <AlertDialogTrigger render={props.children as React.ReactElement} />
      )}

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send a Reset Password Email</AlertDialogTitle>

          <AlertDialogDescription>
            Do you want to send a reset password email to this user?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="relative">
          <AdminResetPasswordForm
            userId={props.userId}
            onSuccess={() => props.onOpenChange(false)}
          />
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AdminResetPasswordForm({
  userId,
  onSuccess,
}: {
  userId: string;
  onSuccess: () => void;
}) {
  const resetPassword = useServerFn(resetPasswordFunction);

  const mutation = useMutation({
    mutationFn: (data: { userId: string; confirmation: string }) =>
      resetPassword({ data }),
    onSuccess: () => {
      toast.success('Password reset email successfully sent');
      onSuccess();
    },
    onError: () => {
      toast.error('We hit an error. Please read the logs.');
    },
  });

  const form = useForm({
    defaultValues: {
      userId,
      confirmation: '',
    },
    validators: {
      onChange: FormSchema,
      onSubmit: FormSchema,
    },
    onSubmit: ({ value }) => mutation.mutate(value),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
      className="space-y-4"
    >
      <form.Field name="confirmation">
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>Confirmation</FieldLabel>

              <FieldDescription>
                Type CONFIRM to execute this request.
              </FieldDescription>

              <Input
                id={field.name}
                placeholder="CONFIRM"
                autoComplete="off"
                name={field.name}
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

      <If condition={mutation.isError}>
        <Alert variant="destructive">
          <AlertTitle>
            We encountered an error while sending the email
          </AlertTitle>

          <AlertDescription>
            Please check the server logs for more details.
          </AlertDescription>
        </Alert>
      </If>

      <If condition={mutation.isSuccess}>
        <Alert>
          <AlertTitle>Password reset email sent successfully</AlertTitle>

          <AlertDescription>
            The password reset email has been sent to the user.
          </AlertDescription>
        </Alert>
      </If>

      <input type="hidden" name="userId" value={userId} />

      <AlertDialogFooter>
        <AlertDialogCancel disabled={mutation.isPending}>
          Cancel
        </AlertDialogCancel>

        <Button
          type="submit"
          disabled={mutation.isPending}
          variant="destructive"
        >
          {mutation.isPending ? 'Sending...' : 'Send Reset Email'}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
