/**
 * Diálogo «Sincronizar tablas» de Ajustes > Recursos (F2.7c).
 *
 * Pide un esquema y, opcionalmente, una tabla, y llama a
 * `POST /v1/tables/sync`, que registra las tablas nuevas y actualiza las
 * columnas y relaciones de las existentes conservando lo configurado. La
 * API rechaza los esquemas protegidos (`auth`, `vault`, `cms`, `pg_*`…).
 */
import { useForm } from '@tanstack/react-form';
import { useTranslations } from 'use-intl';

import { Button } from '@pymekit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pymekit/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@pymekit/ui/field';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { Input } from '@pymekit/ui/input';
import { Spinner } from '@pymekit/ui/spinner';

import { useSyncManagedTablesMutation } from '../../hooks/use-resource-settings-mutations';
import { SyncTablesFormSchema } from '../../utils/resource-settings';

export function SyncTablesDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('cms.settings.resources.sync');
  const mutation = useSyncManagedTablesMutation();
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open: props.open,
    onOpenChange: props.onOpenChange,
  });

  const form = useForm({
    defaultValues: { schema: 'public', table: '' },
    validators: {
      onChange: SyncTablesFormSchema,
      onSubmit: SyncTablesFormSchema,
    },
    onSubmit: async ({ value }) => {
      setIsPending(true);

      try {
        await mutation.mutateAsync({
          schema: value.schema.trim(),
          table: value.table.trim() || undefined,
        });
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
      <DialogContent data-testid="sync-tables-dialog">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <FieldGroup>
            {(['schema', 'table'] as const).map((name) => (
              <form.Field key={name} name={name}>
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={`sync-tables-${name}`}>
                        {t(name)}
                      </FieldLabel>
                      <Input
                        id={`sync-tables-${name}`}
                        data-testid={`sync-tables-${name}`}
                        value={field.state.value}
                        maxLength={63}
                        placeholder={
                          name === 'table' ? t('allTables') : undefined
                        }
                        aria-invalid={isInvalid}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                      />
                      {isInvalid ? (
                        <FieldError>{t('invalidIdentifier')}</FieldError>
                      ) : null}
                    </Field>
                  );
                }}
              </form.Field>
            ))}
          </FieldGroup>

          <DialogFooter>
            <Button
              type="submit"
              data-testid="sync-tables-submit"
              disabled={isPending}
            >
              {isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
              {t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
