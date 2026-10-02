/**
 * Diálogos de los paneles (F2.8): crear o renombrar un panel y confirmar un
 * borrado.
 *
 * El formulario usa TanStack Form + `@pymekit/ui/field` con el mismo límite
 * de nombre que la API (`DashboardNameSchema` de `@pymekit/cms-shared`).
 *
 * [TFG] RF-11 · ADR-013.
 */
import { useForm } from '@tanstack/react-form';
import { useTranslations } from 'use-intl';
import * as z from 'zod';

import { DashboardNameSchema } from '@pymekit/cms-shared/dashboards';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pymekit/ui/dialog';
import { Field, FieldError, FieldLabel } from '@pymekit/ui/field';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { Input } from '@pymekit/ui/input';
import { Spinner } from '@pymekit/ui/spinner';

const NameFormSchema = z.object({ name: DashboardNameSchema });

/**
 * Diálogo con el nombre de un panel. Sirve para crear (sin `initialName`) y
 * para renombrar; `onSubmit` hace la mutación y cierra si va bien.
 */
export function DashboardNameDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  onSubmit: (name: string) => Promise<unknown>;
}) {
  const t = useTranslations('cms.dashboards');
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open: props.open,
    onOpenChange: props.onOpenChange,
  });
  const isRename = props.initialName !== undefined;

  const form = useForm({
    defaultValues: { name: props.initialName ?? '' },
    validators: { onSubmit: NameFormSchema },
    onSubmit: async ({ value }) => {
      setIsPending(true);

      try {
        await props.onSubmit(value.name.trim());
        setOpen(false);
      } catch {
        // El aviso de error ya lo muestra la mutación.
      } finally {
        setIsPending(false);
      }
    },
  });

  return (
    <Dialog {...dialogProps}>
      <DialogContent data-testid="dashboard-name-dialog">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {t(isRename ? 'rename.title' : 'create.title')}
            </DialogTitle>
            <DialogDescription>
              {t(isRename ? 'rename.description' : 'create.description')}
            </DialogDescription>
          </DialogHeader>

          <form.Field name="name">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="dashboard-name">
                  {t('create.name')}
                </FieldLabel>
                <Input
                  id="dashboard-name"
                  data-testid="dashboard-name-input"
                  autoFocus
                  maxLength={255}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              type="submit"
              data-testid="dashboard-name-submit"
              disabled={isPending}
            >
              {isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
              {t(isRename ? 'actions.save' : 'actions.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Confirmación de un borrado (panel o *widget*). */
export function ConfirmDeleteDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => Promise<unknown>;
}) {
  const t = useTranslations('cms.dashboards');
  const { isPending, setIsPending } = useAsyncDialog({
    open: props.open,
    onOpenChange: props.onOpenChange,
  });

  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!isPending) {
          props.onOpenChange(open);
        }
      }}
    >
      <AlertDialogContent data-testid="dashboard-confirm-delete">
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            data-testid="dashboard-confirm-delete-submit"
            disabled={isPending}
            onClick={() => {
              setIsPending(true);
              void props
                .onConfirm()
                .then(() => props.onOpenChange(false))
                .catch(() => {
                  // El aviso de error ya lo muestra la mutación.
                })
                .finally(() => setIsPending(false));
            }}
          >
            {isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
            {t('actions.delete')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
