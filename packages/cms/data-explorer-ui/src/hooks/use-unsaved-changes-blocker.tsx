/**
 * Aviso de cambios sin guardar en el formulario de un registro.
 *
 * Si el usuario intenta salir de la página (otro enlace, «atrás», cerrar la
 * pestaña) con cambios sin guardar o con un envío en curso, se le pide
 * confirmación. Usa `useBlocker` de TanStack Router con resolutor: la
 * navegación queda en pausa y el componente `UnsavedChangesDialog` decide si
 * continúa (`proceed`) o se cancela (`reset`). Para cerrar la pestaña o
 * recargar, el navegador muestra su propio aviso (`beforeunload`).
 *
 * Tras guardar, quien navega a la ficha pone antes `allowed.current = true`:
 * los cambios ya están guardados y no tiene sentido preguntar.
 */
import { useBlocker } from '@tanstack/react-router';
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

export function useUnsavedChangesBlocker(params: {
  hasUnsavedChanges: boolean;
  isSubmitting: boolean;
  /**
   * Referencia que, puesta a `true`, deja salir sin preguntar (tras guardar
   * o borrar, cuando ya no hay nada que perder).
   */
  allowed: { current: boolean };
}) {
  const { allowed } = params;
  const shouldBlock = params.hasUnsavedChanges || params.isSubmitting;

  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      shouldBlock && !allowed.current && current.pathname !== next.pathname,
    enableBeforeUnload: () => shouldBlock && !allowed.current,
    withResolver: true,
  });

  return blocker;
}

/** Diálogo de confirmación que acompaña a `useUnsavedChangesBlocker`. */
export function UnsavedChangesDialog(props: {
  blocker: ReturnType<typeof useUnsavedChangesBlocker>;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { blocker } = props;

  return (
    <AlertDialog
      open={blocker.status === 'blocked'}
      onOpenChange={(open) => {
        if (!open && blocker.status === 'blocked') {
          blocker.reset();
        }
      }}
    >
      <AlertDialogContent data-testid="unsaved-changes-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('record.form.unsavedTitle')}</AlertDialogTitle>

          <AlertDialogDescription>
            {t('record.form.unsavedDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel data-testid="unsaved-changes-stay">
            {t('record.form.stay')}
          </AlertDialogCancel>

          <Button
            variant="destructive"
            data-testid="unsaved-changes-leave"
            onClick={() => blocker.proceed?.()}
          >
            {t('record.form.leave')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
