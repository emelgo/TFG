/**
 * Diálogo para crear un usuario de Auth con correo y contraseña.
 *
 * Solo se ofrece con el permiso `auth_user:insert` (lo decide el listado con
 * los permisos que devuelve la API). A propósito no tiene campos de
 * metadatos ni de rol: la API tampoco los acepta, así que desde el CMS no se
 * puede crear un super-admin ni personal del CMS.
 */
import { useForm } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import type * as z from 'zod';

import { CMS_SECTION_PATHS } from '@pymekit/cms-ui-core/sections';
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
import { Checkbox } from '@pymekit/ui/checkbox';
import { Field, FieldError, FieldLabel } from '@pymekit/ui/field';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { Input } from '@pymekit/ui/input';
import { Spinner } from '@pymekit/ui/spinner';

import { useCreateUserMutation } from '../hooks/use-user-mutations';
import { CreateUserSchema } from '../utils/user-schemas';

export function CreateUserDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('cms.usersExplorer');
  const navigate = useNavigate();
  const mutation = useCreateUserMutation();
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open: props.open,
    onOpenChange: props.onOpenChange,
  });

  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
      autoConfirm: true,
    } as z.input<typeof CreateUserSchema>,
    validators: { onChange: CreateUserSchema, onSubmit: CreateUserSchema },
    onSubmit: async ({ value }) => {
      setIsPending(true);

      try {
        const result = await mutation.mutateAsync(value);

        setOpen(false);
        form.reset();

        // Se abre la ficha del usuario recién creado.
        await navigate({ href: `${CMS_SECTION_PATHS.users}/${result.userId}` });
      } catch {
        // El aviso de error ya lo muestra la mutación.
      } finally {
        setIsPending(false);
      }
    },
  });

  return (
    <AlertDialog {...dialogProps}>
      <AlertDialogContent data-testid="create-user-dialog">
        <form
          data-testid="create-user-form"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t('create.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('create.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form.Field name="email">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor="create-user-email">
                    {t('form.email')}
                  </FieldLabel>
                  <Input
                    id="create-user-email"
                    data-testid="create-user-email"
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

          <form.Field name="password">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor="create-user-password">
                    {t('form.password')}
                  </FieldLabel>
                  <Input
                    id="create-user-password"
                    data-testid="create-user-password"
                    type="password"
                    autoComplete="new-password"
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

          <form.Field name="autoConfirm">
            {(field) => (
              <Field orientation="horizontal">
                <Checkbox
                  id="create-user-auto-confirm"
                  data-testid="create-user-auto-confirm"
                  checked={field.state.value}
                  onCheckedChange={(checked) =>
                    field.handleChange(checked === true)
                  }
                />
                <FieldLabel htmlFor="create-user-auto-confirm">
                  {t('form.autoConfirm')}
                </FieldLabel>
              </Field>
            )}
          </form.Field>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {t('common.cancel')}
            </AlertDialogCancel>

            <Button
              type="submit"
              disabled={isPending}
              data-testid="create-user-submit"
            >
              {isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
              {t('create.submit')}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
