/**
 * Diálogo para invitar a un usuario por correo. Auth le envía un enlace para
 * crear su contraseña. Solo se ofrece con el permiso `auth_user:insert`.
 */
import { useForm } from '@tanstack/react-form';
import { useTranslations } from 'use-intl';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pymekit/ui/alert-dialog';
import { Button } from '@pymekit/ui/button';
import { Field, FieldError } from '@pymekit/ui/field';
import { FieldLabelWithHelp } from '@pymekit/ui/field-help';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { Input } from '@pymekit/ui/input';
import { Spinner } from '@pymekit/ui/spinner';

import { useInviteUserMutation } from '../hooks/use-user-mutations';
import { InviteUserSchema } from '../utils/user-schemas';

export function InviteUserDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('cms.usersExplorer');
  const mutation = useInviteUserMutation();
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open: props.open,
    onOpenChange: props.onOpenChange,
  });

  const form = useForm({
    defaultValues: { email: '' },
    validators: { onChange: InviteUserSchema, onSubmit: InviteUserSchema },
    onSubmit: async ({ value }) => {
      setIsPending(true);

      try {
        await mutation.mutateAsync(value.email);
        setOpen(false);
        form.reset();
      } catch {
        // El aviso de error ya lo muestra la mutación.
      } finally {
        setIsPending(false);
      }
    },
  });

  return (
    <AlertDialog {...dialogProps}>
      <AlertDialogContent data-testid="invite-user-dialog">
        <form
          data-testid="invite-user-form"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t('invite.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('invite.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form.Field name="email">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabelWithHelp
                    htmlFor="invite-user-email"
                    help={t('form.emailHelp')}
                  >
                    {t('form.email')}
                  </FieldLabelWithHelp>
                  <Input
                    id="invite-user-email"
                    data-testid="invite-user-email"
                    type="email"
                    autoComplete="off"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={isInvalid}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              );
            }}
          </form.Field>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {t('common.cancel')}
            </AlertDialogCancel>

            <Button
              type="submit"
              disabled={isPending}
              data-testid="invite-user-submit"
            >
              {isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
              {t('invite.submit')}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
