/**
 * Explorador de una carpeta del almacenamiento
 * (`/admin/cms/storage/$bucket?path=…`).
 *
 * Recibe la página ya cargada por la ruta y la presenta como una cuadrícula
 * de ficheros y carpetas, con migas de pan, búsqueda, paginación, selección
 * múltiple y un menú por elemento. La carpeta abierta, la página y la
 * búsqueda son cambios de la URL (`onSearchChange`).
 *
 * Cada acción aparece solo con el permiso que la API calcula para la ruta
 * exacta de cada elemento (`item.permissions`) o de la carpeta
 * (`folderPermissions.canUpload`):
 *
 * | Acción           | Permiso que se muestra (la API lo vuelve a exigir)   |
 * |------------------|------------------------------------------------------|
 * | abrir / previsualizar / descargar | `select` sobre el elemento          |
 * | subir / crear carpeta | `insert` en la carpeta                          |
 * | renombrar (ficheros) | `delete` sobre el origen e `insert` en la carpeta |
 * | borrar           | `delete` sobre el elemento                           |
 */
import { useState } from 'react';

import { Link } from '@tanstack/react-router';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FolderIcon,
  FolderPlusIcon,
  MoreVerticalIcon,
  PencilIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react';
import { useTranslations } from 'use-intl';

import type {
  CmsBucketContents,
  CmsStorageItem,
} from '@pymekit/cms-ui-core/api';
import { useIsHydrated } from '@pymekit/cms-ui-core/hydration';
import { CMS_SECTION_PATHS } from '@pymekit/cms-ui-core/sections';
import { Button } from '@pymekit/ui/button';
import { Checkbox } from '@pymekit/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pymekit/ui/dropdown-menu';
import {
  EmptyMedia,
  EmptyState,
  EmptyStateHeading,
  EmptyStateText,
} from '@pymekit/ui/empty-state';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@pymekit/ui/input-group';
import { cn } from '@pymekit/ui/utils';

import { useDownloadFileMutation } from '../hooks/use-storage-mutations';
import {
  type StorageSearch,
  getFolderBreadcrumbs,
  withFolder,
} from '../utils/storage-search';
import { FileTypeIcon } from './file-type-icon';
import {
  CreateFolderDialog,
  DeleteItemsDialog,
  ImagePreviewDialog,
  RenameFileDialog,
  UploadFilesDialog,
} from './storage-dialogs';

type DialogState =
  | { kind: 'none' }
  | { kind: 'upload' }
  | { kind: 'createFolder' }
  | { kind: 'rename'; item: CmsStorageItem }
  | { kind: 'delete'; items: CmsStorageItem[] }
  | { kind: 'preview'; item: CmsStorageItem };

export function FileExplorerView(props: {
  bucket: string;
  data: CmsBucketContents;
  search: StorageSearch;
  onSearchChange: (search: StorageSearch) => void;
  isLoading?: boolean;
}) {
  const t = useTranslations('cms.storageExplorer');
  const hydrated = useIsHydrated();
  const download = useDownloadFileMutation();
  const { contents, pagination, folderPermissions } = props.data;
  const path = props.search.path ?? '';

  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  // Selección por ruta; se vacía al cambiar de carpeta (la clave de la
  // ruta monta un componente nuevo).
  const [selected, setSelected] = useState<Record<string, CmsStorageItem>>({});

  const selectedItems = Object.values(selected);

  const closeDialog = () => setDialog({ kind: 'none' });

  const openItem = (item: CmsStorageItem) => {
    if (!item.permissions.canRead) {
      return;
    }

    if (item.isDirectory) {
      props.onSearchChange(withFolder(item.path));
    } else if (item.fileType === 'image' && item.previewUrl) {
      setDialog({ kind: 'preview', item });
    }
  };

  const toggle = (item: CmsStorageItem, checked: boolean) =>
    setSelected((previous) => {
      const next = { ...previous };

      if (checked) {
        next[item.path] = item;
      } else {
        delete next[item.path];
      }

      return next;
    });

  return (
    <div
      data-testid="storage-file-explorer"
      data-hydrated={hydrated}
      className={cn(
        'flex flex-col gap-3 transition-opacity duration-300',
        props.isLoading && 'opacity-50',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav
          className="flex flex-wrap items-center gap-1 text-sm"
          data-testid="storage-breadcrumbs"
        >
          <Link
            to={CMS_SECTION_PATHS.storage}
            className="text-muted-foreground hover:text-foreground"
            data-testid="storage-breadcrumb-buckets"
          >
            {t('title')}
          </Link>
          <ChevronRightIcon className="text-muted-foreground h-3.5 w-3.5" />
          <button
            type="button"
            className="hover:underline"
            data-testid="storage-breadcrumb-root"
            onClick={() => props.onSearchChange(withFolder(''))}
          >
            {props.bucket}
          </button>
          {getFolderBreadcrumbs(path).map((crumb) => (
            <span key={crumb.path} className="flex items-center gap-1">
              <ChevronRightIcon className="text-muted-foreground h-3.5 w-3.5" />
              <button
                type="button"
                className="hover:underline"
                onClick={() => props.onSearchChange(withFolder(crumb.path))}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          {selectedItems.length > 0 ? (
            <>
              <span className="text-muted-foreground text-xs">
                {t('selection.selected', { count: selectedItems.length })}
              </span>
              <Button
                size="sm"
                variant="destructive"
                data-testid="storage-batch-delete"
                onClick={() =>
                  setDialog({ kind: 'delete', items: selectedItems })
                }
              >
                <TrashIcon className="h-3.5 w-3.5" />
                {t('actions.delete')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected({})}>
                <XIcon className="h-3.5 w-3.5" />
                {t('selection.clear')}
              </Button>
            </>
          ) : null}

          {folderPermissions.canUpload ? (
            <>
              <Button
                size="sm"
                variant="outline"
                data-testid="storage-create-folder-button"
                onClick={() => setDialog({ kind: 'createFolder' })}
              >
                <FolderPlusIcon className="h-3.5 w-3.5" />
                {t('actions.createFolder')}
              </Button>
              <Button
                size="sm"
                data-testid="storage-upload-button"
                onClick={() => setDialog({ kind: 'upload' })}
              >
                <UploadIcon className="h-3.5 w-3.5" />
                {t('actions.upload')}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <StorageSearchInput
        key={`${path}:${props.search.search ?? ''}`}
        value={props.search.search ?? ''}
        onSearch={(term) =>
          props.onSearchChange({
            path: props.search.path,
            search: term.trim() || undefined,
            page: undefined,
          })
        }
      />

      {props.data.truncated ? (
        <p className="text-muted-foreground text-xs">{t('list.truncated')}</p>
      ) : null}

      {contents.length === 0 ? (
        <EmptyState data-testid="storage-empty-folder" className="min-h-48 p-6">
          <EmptyMedia variant="icon">
            <FolderIcon />
          </EmptyMedia>
          <EmptyStateHeading>
            {props.search.search
              ? t('list.noResults', { search: props.search.search })
              : t('list.emptyFolder')}
          </EmptyStateHeading>
          <EmptyStateText>{t('list.emptyFolderText')}</EmptyStateText>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {contents.map((item) => (
            <div
              key={item.path}
              data-testid="storage-item"
              data-name={item.name}
              className={cn(
                'relative flex flex-col overflow-hidden rounded-md border',
                selected[item.path] && 'border-primary',
              )}
            >
              {item.permissions.canDelete ? (
                <div className="absolute top-2 left-2 z-10">
                  <Checkbox
                    data-testid="storage-item-select"
                    aria-label={t('selection.select', { name: item.name })}
                    checked={Boolean(selected[item.path])}
                    onCheckedChange={(checked) =>
                      toggle(item, checked === true)
                    }
                  />
                </div>
              ) : null}

              <button
                type="button"
                data-testid="storage-item-open"
                disabled={!item.permissions.canRead}
                className="bg-muted flex h-28 items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => openItem(item)}
              >
                {item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt={item.name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <FileTypeIcon
                    fileType={item.fileType}
                    isDirectory={item.isDirectory}
                    className="h-8 w-8"
                  />
                )}
              </button>

              <div className="flex h-9 items-center justify-between gap-2 px-2">
                <span
                  className="truncate text-xs font-medium"
                  title={item.name}
                  data-testid="storage-item-name"
                >
                  {item.name}
                </span>

                <StorageItemMenu
                  item={item}
                  canUploadHere={folderPermissions.canUpload}
                  onDownload={() =>
                    download.mutate({ bucket: props.bucket, path: item.path })
                  }
                  onRename={() => setDialog({ kind: 'rename', item })}
                  onDelete={() => setDialog({ kind: 'delete', items: [item] })}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">
            {t('list.pagination', {
              page: pagination.page,
              totalPages: pagination.totalPages,
              total: pagination.total,
            })}
          </span>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!pagination.hasPreviousPage}
              onClick={() =>
                props.onSearchChange({
                  ...props.search,
                  page: pagination.page > 2 ? pagination.page - 1 : undefined,
                })
              }
            >
              <ChevronLeftIcon className="h-3.5 w-3.5" />
              {t('list.previous')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!pagination.hasNextPage}
              onClick={() =>
                props.onSearchChange({
                  ...props.search,
                  page: pagination.page + 1,
                })
              }
            >
              {t('list.next')}
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      <UploadFilesDialog
        open={dialog.kind === 'upload'}
        onOpenChange={(open) => (open ? null : closeDialog())}
        bucket={props.bucket}
        folder={path}
      />

      <CreateFolderDialog
        open={dialog.kind === 'createFolder'}
        onOpenChange={(open) => (open ? null : closeDialog())}
        bucket={props.bucket}
        parentPath={path}
      />

      {dialog.kind === 'rename' ? (
        <RenameFileDialog
          key={dialog.item.path}
          open
          onOpenChange={(open) => (open ? null : closeDialog())}
          bucket={props.bucket}
          item={dialog.item}
        />
      ) : null}

      {dialog.kind === 'delete' ? (
        <DeleteItemsDialog
          open
          onOpenChange={(open) => (open ? null : closeDialog())}
          bucket={props.bucket}
          items={dialog.items}
          onDeleted={() => setSelected({})}
        />
      ) : null}

      <ImagePreviewDialog
        open={dialog.kind === 'preview'}
        onOpenChange={(open) => (open ? null : closeDialog())}
        item={dialog.kind === 'preview' ? dialog.item : null}
      />
    </div>
  );
}

/** Menú de acciones de un elemento: solo las que permite la API. */
function StorageItemMenu(props: {
  item: CmsStorageItem;
  canUploadHere: boolean;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('cms.storageExplorer');
  const { item } = props;

  const canDownload = !item.isDirectory && item.permissions.canRead;
  // Renombrar es mover: la API exige `delete` sobre el origen e `insert` en
  // el destino (la misma carpeta). Las carpetas no se renombran: en Storage
  // no existen como objeto y habría que mover cada fichero.
  const canRename =
    !item.isDirectory && item.permissions.canDelete && props.canUploadHere;
  const canDelete = item.permissions.canDelete;

  if (!canDownload && !canRename && !canDelete) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            data-testid="storage-item-menu"
            aria-label={t('actions.menu', { name: item.name })}
          />
        }
      >
        <MoreVerticalIcon className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        {canDownload ? (
          <DropdownMenuItem
            data-testid="storage-item-download"
            onClick={props.onDownload}
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            {t('actions.download')}
          </DropdownMenuItem>
        ) : null}

        {canRename ? (
          <DropdownMenuItem
            data-testid="storage-item-rename"
            onClick={props.onRename}
          >
            <PencilIcon className="h-3.5 w-3.5" />
            {t('actions.rename')}
          </DropdownMenuItem>
        ) : null}

        {canDelete ? (
          <>
            {canDownload || canRename ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              data-testid="storage-item-delete"
              className="text-destructive"
              onClick={props.onDelete}
            >
              <TrashIcon className="h-3.5 w-3.5" />
              {t('actions.delete')}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StorageSearchInput(props: {
  value: string;
  onSearch: (term: string) => void;
}) {
  const t = useTranslations('cms.storageExplorer');
  const [term, setTerm] = useState(props.value);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSearch(term);
      }}
    >
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon className="h-4 w-4" />
        </InputGroupAddon>
        <InputGroupInput
          data-testid="storage-search-input"
          placeholder={t('list.searchPlaceholder')}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
        {props.value ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton onClick={() => props.onSearch('')}>
              <XIcon className="h-3 w-3" />
              {t('list.clearSearch')}
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </form>
  );
}
