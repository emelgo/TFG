/**
 * Diálogos del explorador de almacenamiento: crear carpeta, subir ficheros,
 * renombrar, borrar y vista previa de imágenes.
 *
 * Los formularios usan TanStack Form con validación Zod construida sobre las
 * mismas reglas de nombres que aplica la API
 * (`@pymekit/cms-shared/storage-paths`), para avisar antes de enviar. Todos
 * los diálogos con una operación en curso usan `useAsyncDialog`, que impide
 * cerrarlos a medias. Se muestran solo con los permisos que devuelve la API y
 * la API los vuelve a comprobar.
 */
import { useState } from 'react';

import { useForm } from '@tanstack/react-form';
import { useTranslations } from 'use-intl';
import * as z from 'zod';

import {
  STORAGE_LIMITS,
  getFileNameError,
  getParentPath,
  joinStoragePath,
} from '@pymekit/cms-shared/storage-paths';
import type { CmsStorageItem } from '@pymekit/cms-ui-core/api';
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
  DialogHeader,
  DialogTitle,
} from '@pymekit/ui/dialog';
import { Field, FieldError, FieldLabel } from '@pymekit/ui/field';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { Input } from '@pymekit/ui/input';
import { Spinner } from '@pymekit/ui/spinner';

import {
  useCreateFolderMutation,
  useDeleteFilesMutation,
  useRenameFileMutation,
  useUploadFilesMutation,
} from '../hooks/use-storage-mutations';
import {
  MAX_FILES_PER_UPLOAD,
  formatBytes,
  getUploadFileError,
} from '../utils/upload-validation';

/** Nombre de fichero o carpeta válido (un solo segmento). */
const FileNameSchema = z.object({
  name: z
    .string()
    .trim()
    .refine(
      (name) => getFileNameError(name) === null,
      'cms.storageExplorer.errors.invalidFileName',
    ),
});

type DialogControl = { open: boolean; onOpenChange: (open: boolean) => void };

/** Crea una carpeta dentro de la carpeta actual. */
export function CreateFolderDialog(
  props: DialogControl & { bucket: string; parentPath: string },
) {
  const t = useTranslations('cms.storageExplorer');
  const mutation = useCreateFolderMutation();
  const dialog = useAsyncDialog(props);

  return (
    <AlertDialog {...dialog.dialogProps}>
      <AlertDialogContent data-testid="storage-create-folder-dialog">
        <NameForm
          defaultName=""
          inputTestId="storage-folder-name-input"
          submitTestId="storage-create-folder-submit"
          title={t('createFolder.title')}
          description={t('createFolder.description')}
          label={t('createFolder.nameLabel')}
          submitLabel={t('createFolder.submit')}
          dialog={dialog}
          onSubmit={async (name) => {
            await mutation.mutateAsync({
              bucket: props.bucket,
              parentPath: props.parentPath,
              folderName: name,
            });
          }}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Renombra un fichero dentro de su misma carpeta. */
export function RenameFileDialog(
  props: DialogControl & { bucket: string; item: CmsStorageItem },
) {
  const t = useTranslations('cms.storageExplorer');
  const mutation = useRenameFileMutation();
  const dialog = useAsyncDialog(props);

  return (
    <AlertDialog {...dialog.dialogProps}>
      <AlertDialogContent data-testid="storage-rename-dialog">
        <NameForm
          defaultName={props.item.name}
          inputTestId="storage-rename-input"
          submitTestId="storage-rename-submit"
          title={t('rename.title')}
          description={t('rename.description', { name: props.item.name })}
          label={t('rename.nameLabel')}
          submitLabel={t('rename.submit')}
          dialog={dialog}
          onSubmit={async (name) => {
            // Mismo nombre: no hay nada que mover.
            if (name === props.item.name) {
              return;
            }

            await mutation.mutateAsync({
              bucket: props.bucket,
              fromPath: props.item.path,
              toPath: joinStoragePath(getParentPath(props.item.path), name),
            });
          }}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Formulario de un solo nombre, compartido por «crear carpeta» y
 * «renombrar». Si `onSubmit` termina bien cierra el diálogo; si lanza, lo
 * deja abierto (el aviso de error lo muestra la mutación).
 */
function NameForm(props: {
  defaultName: string;
  inputTestId: string;
  submitTestId: string;
  title: string;
  description: string;
  label: string;
  submitLabel: string;
  dialog: ReturnType<typeof useAsyncDialog>;
  onSubmit: (name: string) => Promise<void>;
}) {
  const t = useTranslations('cms.storageExplorer');
  const { isPending, setIsPending, setOpen } = props.dialog;

  const form = useForm({
    defaultValues: { name: props.defaultName },
    validators: { onChange: FileNameSchema, onSubmit: FileNameSchema },
    onSubmit: async ({ value }) => {
      setIsPending(true);

      try {
        await props.onSubmit(value.name.trim());
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

      <form.Field name="name">
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={props.inputTestId}>{props.label}</FieldLabel>
              <Input
                id={props.inputTestId}
                data-testid={props.inputTestId}
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
          data-testid={props.submitTestId}
        >
          {isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
          {props.submitLabel}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

/**
 * Sube ficheros a la carpeta actual. Cada fichero se comprueba antes de
 * enviarlo (tamaño y nombre); la API repite las comprobaciones y decide el
 * tipo de contenido con el que se guarda.
 */
export function UploadFilesDialog(
  props: DialogControl & { bucket: string; folder: string },
) {
  const t = useTranslations('cms.storageExplorer');
  const mutation = useUploadFilesMutation();
  const { dialogProps, isPending, setIsPending, setOpen } =
    useAsyncDialog(props);
  const [files, setFiles] = useState<File[]>([]);

  const errors = files.map((file) => getUploadFileError(file));
  const tooMany = files.length > MAX_FILES_PER_UPLOAD;
  const canSubmit =
    files.length > 0 && !tooMany && errors.every((error) => error === null);

  const onSubmit = async () => {
    setIsPending(true);

    try {
      await mutation.mutateAsync({
        bucket: props.bucket,
        folder: props.folder,
        files,
      });
      setOpen(false);
      setFiles([]);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AlertDialog {...dialogProps}>
      <AlertDialogContent data-testid="storage-upload-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('upload.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('upload.description', {
              max: formatBytes(STORAGE_LIMITS.maxUploadBytes),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Input
          type="file"
          multiple
          data-testid="storage-upload-input"
          disabled={isPending}
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        />

        {files.length > 0 ? (
          <ul
            className="flex flex-col gap-1 text-xs"
            data-testid="storage-upload-files"
          >
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex justify-between gap-2"
              >
                <span className="truncate">{file.name}</span>
                <span
                  className={
                    errors[index] ? 'text-destructive' : 'text-muted-foreground'
                  }
                >
                  {errors[index] ? t(errors[index]) : formatBytes(file.size)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {tooMany ? (
          <p className="text-destructive text-xs">
            {t('upload.tooManyFiles', { max: MAX_FILES_PER_UPLOAD })}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t('common.cancel')}
          </AlertDialogCancel>
          <Button
            disabled={isPending || !canSubmit}
            data-testid="storage-upload-submit"
            onClick={() => void onSubmit()}
          >
            {isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
            {t('upload.submit')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Confirma el borrado de ficheros y carpetas. Borrar una carpeta borra todo
 * su contenido, así que se avisa expresamente.
 */
export function DeleteItemsDialog(
  props: DialogControl & {
    bucket: string;
    items: CmsStorageItem[];
    onDeleted?: () => void;
  },
) {
  const t = useTranslations('cms.storageExplorer');
  const mutation = useDeleteFilesMutation();
  const { dialogProps, isPending, setIsPending, setOpen } =
    useAsyncDialog(props);
  const hasFolders = props.items.some((item) => item.isDirectory);

  const onConfirm = async () => {
    setIsPending(true);

    try {
      await mutation.mutateAsync({
        bucket: props.bucket,
        paths: props.items.map((item) => item.path),
      });
      setOpen(false);
      props.onDeleted?.();
    } catch {
      // El aviso de error ya lo muestra la mutación.
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AlertDialog {...dialogProps}>
      <AlertDialogContent data-testid="storage-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('delete.title', { count: props.items.length })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasFolders
              ? t('delete.descriptionWithFolders')
              : t('delete.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="max-h-32 overflow-y-auto font-mono text-xs">
          {props.items.map((item) => (
            <li key={item.path}>{item.path}</li>
          ))}
        </ul>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t('common.cancel')}
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={isPending}
            data-testid="storage-delete-confirm"
            onClick={() => void onConfirm()}
          >
            {isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
            {t('delete.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Vista previa de una imagen. Se pinta con `<img>` a partir de la URL
 * firmada de corta duración que da la API: una etiqueta `<img>` nunca
 * ejecuta código, aunque el objeto no fuera realmente una imagen. No se
 * ofrece «abrir en otra pestaña» con esa URL por el mismo motivo; para
 * obtener el fichero está «Descargar», que fuerza la descarga.
 */
export function ImagePreviewDialog(
  props: DialogControl & { item: CmsStorageItem | null },
) {
  const t = useTranslations('cms.storageExplorer');

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        className="max-w-3xl"
        data-testid="storage-image-preview-dialog"
      >
        <DialogHeader>
          <DialogTitle className="truncate">{props.item?.name}</DialogTitle>
          <DialogDescription>
            {t('preview.description', {
              size: formatBytes(props.item?.size),
            })}
          </DialogDescription>
        </DialogHeader>

        {props.item?.previewUrl ? (
          <img
            data-testid="storage-image-preview"
            src={props.item.previewUrl}
            alt={props.item.name}
            referrerPolicy="no-referrer"
            className="max-h-[70vh] w-full rounded-md object-contain"
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            {t('preview.unavailable')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
