/**
 * Diálogo de confirmación de las acciones sobre usuarios.
 *
 * Las acciones irreversibles o delicadas (borrar, bloquear, conceder acceso
 * al CMS…) piden confirmación; las más graves exigen además escribir una
 * palabra (`confirmWord`, por ejemplo `ELIMINAR`), validada con TanStack Form y
 * el mismo esquema que describe el error. Mientras la acción está en curso
 * el diálogo no se puede cerrar (`useAsyncDialog`).
 *
 * El diálogo solo pide confirmación: quien lo usa decide si mostrarlo según
 * las acciones que la API dice que están disponibles, y la API vuelve a
 * comprobarlo todo al ejecutarla.
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
  AlertDialogTrigger,
} from '@pymekit/ui/alert-dialog';
import { Button } from '@pymekit/ui/button';
import { Field, FieldError, FieldLabel } from '@pymekit/ui/field';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { Input } from '@pymekit/ui/input';
import { Spinner } from '@pymekit/ui/spinner';

import { createConfirmationSchema } from '../utils/user-schemas';

export function ConfirmUserActionDialog(props: {
  /** Botón que abre el diálogo (se renderiza con `render`). */
  trigger?: React.ReactElement;
  /** Contenido del botón que abre el diálogo. */
  triggerContent?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel: React.ReactNode;
  /** Palabra que hay que escribir para confirmar (opcional). */
  confirmWord?: string;
  destructive?: boolean;
  testId: string;
  /** Ejecuta la acción; si lanza, el diálogo sigue abierto. */
  onConfirm: () => Promise<unknown>;
}) {
  const t = useTranslations('cms.usersExplorer');
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open: props.open,
    onOpenChange: props.onOpenChange,
  });

  const schema = createConfirmationSchema(props.confirmWord ?? '');

  const form = useForm({
    defaultValues: { confirmText: '' },
    validators: props.confirmWord
      ? { onChange: schema, onSubmit: schema }
      : undefined,
    onSubmit: async () => {
      setIsPending(true);

      try {
        await props.onConfirm();
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
      {props.trigger ? (
        <AlertDialogTrigger render={props.trigger}>
          {props.triggerContent}
        </AlertDialogTrigger>
      ) : null}

      <AlertDialogContent data-testid={`${props.testId}-dialog`}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{props.title}</AlertDialogTitle>
            <AlertDialogDescription>{props.description}</AlertDialogDescription>
          </AlertDialogHeader>

          {props.confirmWord ? (
            <form.Field name="confirmText">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={`${props.testId}-confirm-input`}>
                      {t('confirm.typeToConfirm', {
                        word: props.confirmWord ?? '',
                      })}
                    </FieldLabel>

                    <Input
                      id={`${props.testId}-confirm-input`}
                      data-testid={`${props.testId}-confirm-input`}
                      autoComplete="off"
                      placeholder={props.confirmWord}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      aria-invalid={isInvalid}
                    />

                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                );
              }}
            </form.Field>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {t('common.cancel')}
            </AlertDialogCancel>

            <Button
              type="submit"
              variant={props.destructive ? 'destructive' : 'default'}
              disabled={isPending}
              data-testid={`${props.testId}-confirm`}
            >
              {isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
              {props.confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
