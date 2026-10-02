/**
 * Botón y diálogo de confirmación para borrar el registro de la ficha.
 *
 * Borrar es irreversible, así que siempre se pide confirmación. Mientras se
 * borra, el diálogo no se puede cerrar (`useAsyncDialog`). Al terminar se
 * vuelve al listado de la tabla y se quita la ficha de la caché.
 *
 * Solo se muestra si el usuario tiene permiso `delete` sobre la tabla (lo
 * decide `RecordView` con los permisos que devuelve la API); la API y la
 * función SQL lo vuelven a comprobar.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { TrashIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { cmsQueryKeys } from '@pymekit/cms-ui-core/queries';
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

import { useDeleteRecordMutation } from '../../hooks/use-record-mutations';

export function DeleteRecordDialog(props: {
  schema: string;
  table: string;
  /** Clave del registro (primaria o única) con la que se borra. */
  keys: Record<string, string>;
  /** Claves con las que se cargó la ficha (su entrada de caché). */
  cacheKeys: Record<string, string>;
  recordName: string;
  /** URL a la que se vuelve tras borrar (el listado de la tabla). */
  listHref: string;
}) {
  const t = useTranslations('cms.dataExplorer');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useDeleteRecordMutation();
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog();

  const onConfirm = async () => {
    setIsPending(true);

    try {
      await mutation.mutateAsync({
        schema: props.schema,
        table: props.table,
        keys: props.keys,
        cacheKeys: props.cacheKeys,
      });

      setOpen(false);

      await navigate({ href: props.listHref });

      queryClient.removeQueries({
        queryKey: cmsQueryKeys.record({
          schema: props.schema,
          table: props.table,
          keys: props.cacheKeys,
        }),
      });
    } catch {
      // El aviso de error ya lo muestra la mutación; el diálogo sigue abierto.
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
            variant="destructive"
            data-testid="delete-record-button"
          />
        }
      >
        <TrashIcon className="h-3.5 w-3.5" />
        {t('record.delete.button')}
      </AlertDialogTrigger>

      <AlertDialogContent data-testid="delete-record-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('record.delete.title')}</AlertDialogTitle>

          <AlertDialogDescription>
            {t('record.delete.description', { name: props.recordName })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t('record.delete.cancel')}
          </AlertDialogCancel>

          <Button
            variant="destructive"
            data-testid="confirm-delete-record"
            disabled={isPending}
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
