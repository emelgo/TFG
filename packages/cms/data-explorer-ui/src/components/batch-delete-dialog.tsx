/**
 * Acción de borrado múltiple del listado: botón con el número de filas
 * seleccionadas y diálogo de confirmación con la lista de lo que se va a
 * borrar.
 *
 * La selección la gestiona el listado (`utils/record-selection.ts`); aquí
 * solo se envían sus condiciones a `DELETE /v1/tables/:schema/:table/records`
 * y, al terminar, se vacía. Si alguna fila no se pudo borrar (por ejemplo,
 * porque otras tablas apuntan a ella), el aviso lo indica con el recuento.
 *
 * Solo aparece con permiso `delete` sobre la tabla; la API lo vuelve a
 * comprobar.
 */
import { TrashIcon } from 'lucide-react';
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
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { Spinner } from '@pymekit/ui/spinner';

import { useBatchDeleteRecordsMutation } from '../hooks/use-record-mutations';
import { getRecordDisplayName } from '../utils/record-relations';
import type { RecordSelection } from '../utils/record-selection';

/** Filas que se listan en el diálogo antes de resumir el resto. */
const PREVIEW_LIMIT = 10;

export function BatchDeleteDialog(props: {
  schema: string;
  table: string;
  selection: RecordSelection;
  displayFormat: string | null | undefined;
  onDeleted: () => void;
}) {
  const t = useTranslations('cms.dataExplorer');
  const mutation = useBatchDeleteRecordsMutation();
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog();

  const selected = [...props.selection.values()];
  const count = selected.length;

  const onConfirm = async () => {
    setIsPending(true);

    try {
      await mutation.mutateAsync({
        schema: props.schema,
        table: props.table,
        items: selected.map((item) => item.conditions),
      });

      setOpen(false);
      props.onDeleted();
    } catch {
      // El aviso de error ya lo muestra la mutación.
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AlertDialog {...dialogProps}>
      <AlertDialogTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            className="border-destructive text-destructive h-7"
            data-testid="batch-delete-button"
            data-count={count}
          />
        }
      >
        <TrashIcon className="h-3.5 w-3.5" />
        {t('table.deleteSelected', { count })}
      </AlertDialogTrigger>

      <AlertDialogContent data-testid="batch-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('table.deleteSelectedTitle', { count })}
          </AlertDialogTitle>

          <AlertDialogDescription>
            {t('table.deleteSelectedDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="bg-muted text-muted-foreground max-h-40 overflow-y-auto rounded-md p-2 text-sm">
          {selected.slice(0, PREVIEW_LIMIT).map((item) => (
            <li key={JSON.stringify(item.conditions)} className="truncate">
              {getRecordDisplayName(
                props.displayFormat,
                item.record,
                Object.values(item.conditions).join(' · '),
              )}
            </li>
          ))}

          {count > PREVIEW_LIMIT ? (
            <li>{t('table.andMore', { count: count - PREVIEW_LIMIT })}</li>
          ) : null}
        </ul>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t('record.delete.cancel')}
          </AlertDialogCancel>

          <Button
            variant="destructive"
            data-testid="confirm-batch-delete"
            disabled={isPending || count === 0}
            onClick={() => void onConfirm()}
          >
            {isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
            {t('record.delete.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
