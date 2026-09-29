/**
 * Vistas guardadas de una tabla (`cms.saved_views`).
 *
 * Una vista guarda los filtros, la ordenación y la búsqueda del listado con
 * un nombre, para volver a ellos con un clic. Las **personales** solo las ve
 * su autor; las **de equipo** son vistas que otros han compartido con alguno
 * de los roles del usuario. Desde aquí se puede:
 *
 *  - cargar una vista (se copia su configuración a la URL, ver
 *    `savedViewToSearch`) o dejar de usarla;
 *  - guardar el listado actual como vista nueva, opcionalmente compartida con
 *    roles de rango inferior al propio;
 *  - actualizar o borrar una vista personal.
 *
 * Solo se ofrecen «actualizar» y «borrar» en las vistas personales, pero la
 * autorización real la hacen las políticas RLS de `cms.saved_views`: la API
 * ejecuta las consultas con los *claims* del usuario.
 *
 * [TFG] RF-09: vistas guardadas del explorador de datos.
 */
import { useState } from 'react';

import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookmarkIcon,
  CheckIcon,
  PlusCircleIcon,
  SquarePenIcon,
  TrashIcon,
  X,
} from 'lucide-react';
import { useTranslations } from 'use-intl';
import * as z from 'zod';

import type { CmsSavedView, CmsSavedViews } from '@pymekit/cms-ui-core/api';
import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { cmsQueryKeys } from '@pymekit/cms-ui-core/queries';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pymekit/ui/alert-dialog';
import { Button } from '@pymekit/ui/button';
import { Checkbox } from '@pymekit/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pymekit/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pymekit/ui/dropdown-menu';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@pymekit/ui/field';
import { Input } from '@pymekit/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@pymekit/ui/popover';
import { toast } from '@pymekit/ui/sonner';
import { cn } from '@pymekit/ui/utils';

import {
  isSavedViewDirty,
  savedViewToSearch,
  searchToSavedViewConfig,
} from '../../utils/saved-views';
import type { DataExplorerSearch } from '../../utils/search-schema';

type SavedViewsProps = {
  schema: string;
  table: string;
  views: CmsSavedViews | undefined;
  search: DataExplorerSearch;
  onSearchChange: (search: DataExplorerSearch) => void;
};

/** Esquema del formulario «Guardar vista». Los mensajes son claves i18n. */
const CreateSavedViewFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'cms.dataExplorer.views.nameRequired')
    .max(255, 'cms.dataExplorer.views.nameTooLong'),
  description: z.string().max(500, 'cms.dataExplorer.views.descriptionTooLong'),
  roles: z.array(z.string()).max(10, 'cms.dataExplorer.views.tooManyRoles'),
});

/** Indica si el listado tiene algo que merezca guardarse como vista. */
function hasViewState(search: DataExplorerSearch) {
  return Boolean(
    Object.keys(search.filters ?? {}).length > 0 ||
    search.search ||
    search.sortColumn,
  );
}

export function SavedViewsDropdown(props: SavedViewsProps) {
  const t = useTranslations('cms.dataExplorer');

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CmsSavedView | null>(null);

  const personal = props.views?.personal ?? [];
  const team = props.views?.team ?? [];
  const activeViewId = props.search.view;

  const selectedView =
    [...personal, ...team].find((view) => view.id === activeViewId) ?? null;

  const isPersonal = personal.some((view) => view.id === activeViewId);

  const selectView = (view: CmsSavedView) => {
    if (view.id !== activeViewId) {
      props.onSearchChange(savedViewToSearch(view, props.search));
    }
  };

  const unselectView = () => {
    props.onSearchChange({ ...props.search, view: undefined });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              data-testid="saved-views-dropdown-trigger"
              className={cn('m-0 h-6 gap-x-1 px-2 py-0 shadow-none', {
                'border-primary': selectedView,
              })}
            />
          }
        >
          <BookmarkIcon
            className={cn('h-3 w-3', {
              'fill-primary text-primary': selectedView,
            })}
          />

          <span className="text-xs">
            {selectedView?.name || t('views.savedViews')}
          </span>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="min-w-80">
          <div className="flex max-h-[60vh] flex-col overflow-y-auto">
            {personal.length > 0 && (
              <DropdownMenuGroup data-testid="personal-views-section">
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  {t('views.personalViews')}
                </DropdownMenuLabel>

                {personal.map((view) => (
                  <SavedViewItem
                    key={view.id}
                    view={view}
                    isActive={view.id === activeViewId}
                    onSelect={() => selectView(view)}
                    onUnselect={unselectView}
                    onDelete={() => setDeleteTarget(view)}
                  />
                ))}
              </DropdownMenuGroup>
            )}

            {team.length > 0 && (
              <DropdownMenuGroup data-testid="team-views-section">
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  {t('views.teamViews')}
                </DropdownMenuLabel>

                {team.map((view) => (
                  <SavedViewItem
                    key={view.id}
                    view={view}
                    isActive={view.id === activeViewId}
                    onSelect={() => selectView(view)}
                    onUnselect={unselectView}
                  />
                ))}
              </DropdownMenuGroup>
            )}

            {personal.length === 0 && team.length === 0 && (
              <p
                className="text-muted-foreground px-2 py-4 text-center text-xs"
                data-testid="no-saved-views"
              >
                {t('views.noViews')}
              </p>
            )}
          </div>

          <DropdownMenuSeparator />

          {selectedView && isPersonal ? (
            <UpdateViewItem
              schema={props.schema}
              table={props.table}
              view={selectedView}
              search={props.search}
            />
          ) : null}

          {!selectedView && (
            <DropdownMenuItem
              data-testid="save-current-view-button"
              disabled={!hasViewState(props.search)}
              onClick={() => setCreateOpen(true)}
            >
              <PlusCircleIcon className="h-3.5 w-3.5" />
              <span>
                {hasViewState(props.search)
                  ? t('views.saveCurrentView')
                  : t('views.addFiltersFirst')}
              </span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateViewDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        schema={props.schema}
        table={props.table}
        search={props.search}
        onCreated={(view) => {
          setCreateOpen(false);
          props.onSearchChange(savedViewToSearch(view, props.search));
        }}
      />

      {deleteTarget && (
        <DeleteViewDialog
          schema={props.schema}
          table={props.table}
          view={deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          onDeleted={() => {
            if (deleteTarget.id === activeViewId) {
              unselectView();
            }

            setDeleteTarget(null);
          }}
        />
      )}
    </>
  );
}

function SavedViewItem(props: {
  view: CmsSavedView;
  isActive: boolean;
  onSelect: () => void;
  onUnselect: () => void;
  onDelete?: () => void;
}) {
  const t = useTranslations('cms.dataExplorer');

  return (
    <DropdownMenuItem
      data-testid="saved-view-item"
      data-view-name={props.view.name}
      className={cn('flex h-7 justify-between text-xs', {
        'bg-muted': props.isActive,
        'cursor-pointer': !props.isActive,
      })}
      onClick={props.onSelect}
    >
      {props.isActive && (
        <CheckIcon className="h-3 w-3" data-testid="active-view-checkmark" />
      )}

      <span className="grow truncate">{props.view.name}</span>

      {props.isActive && (
        <Button
          variant="ghost"
          size="icon-sm"
          data-testid="unselect-view-button"
          aria-label={t('views.unselectView')}
          title={t('views.unselectView')}
          className="hover:text-primary h-6 w-6 p-0"
          onClick={(e) => {
            e.stopPropagation();
            props.onUnselect();
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      )}

      {props.onDelete && (
        <Button
          variant="ghost"
          size="icon-sm"
          data-testid="delete-view-button"
          aria-label={t('views.deleteView', { name: props.view.name })}
          title={t('views.deleteView', { name: props.view.name })}
          className="hover:text-destructive h-6 w-6 p-0"
          onClick={(e) => {
            e.stopPropagation();
            props.onDelete?.();
          }}
        >
          <TrashIcon className="h-3 w-3" />
        </Button>
      )}
    </DropdownMenuItem>
  );
}

/** Guarda en la vista personal activa los filtros actuales de la URL. */
function UpdateViewItem(props: {
  schema: string;
  table: string;
  view: CmsSavedView;
  search: DataExplorerSearch;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { api } = useCmsApi();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      api.updateSavedView({
        schema: props.schema,
        table: props.table,
        id: props.view.id,
        data: { config: searchToSavedViewConfig(props.search) },
      }),
    onSuccess: () => {
      toast.success(t('views.viewUpdated'));

      return queryClient.invalidateQueries({
        queryKey: cmsQueryKeys.savedViews(props.schema, props.table),
      });
    },
    onError: () => toast.error(t('views.viewUpdateFailed')),
  });

  const isDirty = isSavedViewDirty(props.view, props.search);

  return (
    <DropdownMenuItem
      data-testid="update-saved-view-button"
      disabled={mutation.isPending || !isDirty}
      onClick={() => mutation.mutate()}
    >
      <SquarePenIcon className="h-3.5 w-3.5" />

      <span>
        {mutation.isPending ? t('views.updatingView') : t('views.updateView')}
      </span>
    </DropdownMenuItem>
  );
}

function CreateViewDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schema: string;
  table: string;
  search: DataExplorerSearch;
  onCreated: (view: CmsSavedView) => void;
}) {
  const t = useTranslations('cms.dataExplorer');

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent data-testid="create-saved-view-dialog">
        <DialogHeader>
          <DialogTitle>{t('views.saveView')}</DialogTitle>

          <DialogDescription>
            {t('views.saveViewDescription')}
          </DialogDescription>
        </DialogHeader>

        {props.open && (
          <CreateSavedViewForm
            schema={props.schema}
            table={props.table}
            search={props.search}
            onCreated={props.onCreated}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Formulario «Guardar vista» con TanStack Form y validación Zod. La
 * configuración que se guarda sale de la URL en el momento de enviar.
 */
function CreateSavedViewForm(props: {
  schema: string;
  table: string;
  search: DataExplorerSearch;
  onCreated: (view: CmsSavedView) => void;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { api } = useCmsApi();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (value: z.output<typeof CreateSavedViewFormSchema>) =>
      api.createSavedView({
        schema: props.schema,
        table: props.table,
        data: {
          name: value.name,
          description: value.description || undefined,
          roles: value.roles,
          config: searchToSavedViewConfig(props.search),
        },
      }),
    onSuccess: async (result) => {
      toast.success(t('views.viewCreated'));

      await queryClient.invalidateQueries({
        queryKey: cmsQueryKeys.savedViews(props.schema, props.table),
      });

      if (result.data) {
        props.onCreated(result.data as CmsSavedView);
      }
    },
    onError: () => toast.error(t('views.viewCreationFailed')),
  });

  const form = useForm({
    defaultValues: { name: '', description: '', roles: [] as string[] },
    validators: {
      onChange: CreateSavedViewFormSchema,
      onSubmit: CreateSavedViewFormSchema,
    },
    onSubmit: ({ value }) =>
      mutation.mutateAsync(CreateSavedViewFormSchema.parse(value)),
  });

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="name">
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>
                {t('views.viewName')}
              </FieldLabel>

              <Input
                id={field.name}
                name={field.name}
                data-testid="saved-view-name-input"
                placeholder={t('views.viewName')}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={isInvalid}
              />

              <FieldDescription>
                {t('views.viewNameDescription')}
              </FieldDescription>
              <FieldError errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.Field>

      <form.Field name="description">
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>
                <span>{t('views.description')}</span>
                <span className="text-muted-foreground text-xs">
                  {t('views.optional')}
                </span>
              </FieldLabel>

              <Input
                id={field.name}
                name={field.name}
                data-testid="saved-view-description-input"
                placeholder={t('views.descriptionPlaceholder')}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={isInvalid}
              />

              <FieldDescription>{t('views.descriptionHelp')}</FieldDescription>
              <FieldError errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.Field>

      <form.Field name="roles">
        {(field) => (
          <Field>
            <FieldLabel>
              <span>{t('views.shareWithRoles')}</span>
              <span className="text-muted-foreground text-xs">
                {t('views.optional')}
              </span>
            </FieldLabel>

            <RolesPicker
              value={field.state.value}
              onChange={(roles) => field.handleChange(roles)}
            />

            <FieldError errors={field.state.meta.errors} />
          </Field>
        )}
      </form.Field>

      <DialogFooter className="gap-x-2">
        <DialogClose
          disabled={mutation.isPending}
          render={<Button variant="outline" type="button" />}
        >
          {t('views.cancel')}
        </DialogClose>

        <form.Subscribe selector={(state) => state.canSubmit}>
          {(canSubmit) => (
            <Button
              type="submit"
              data-testid="submit-saved-view-button"
              disabled={!canSubmit || mutation.isPending}
            >
              {mutation.isPending ? t('views.creatingView') : t('views.save')}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}

/**
 * Selector de roles con los que compartir la vista. La API solo devuelve los
 * roles de rango inferior al del usuario (no se puede compartir «hacia
 * arriba»), y la base de datos lo vuelve a comprobar al guardar.
 */
function RolesPicker(props: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { queries } = useCmsApi();
  const { data, isLoading, isError } = useQuery(queries.rolesForSharing());

  const roles = data?.roles ?? [];

  const selectedNames = roles
    .filter((role) => props.value.includes(role.id))
    .map((role) => role.name)
    .join(', ');

  return (
    <>
      <Popover modal>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="flex w-fit items-center gap-2"
              size="sm"
              data-testid="select-roles-button"
            />
          }
        >
          <PlusCircleIcon className="h-3 w-3" />

          <span>{t('views.pickRoles')}</span>

          {props.value.length > 0 && (
            <span className="text-muted-foreground text-xs">
              (+{props.value.length})
            </span>
          )}
        </PopoverTrigger>

        <PopoverContent className="w-64 p-2" align="start">
          {isLoading ? (
            <p className="text-muted-foreground p-2 text-xs">
              {t('views.loadingRoles')}
            </p>
          ) : isError ? (
            <p className="text-destructive p-2 text-xs">
              {t('views.errorLoadingRoles')}
            </p>
          ) : roles.length === 0 ? (
            <p className="text-muted-foreground p-2 text-xs">
              {t('views.noRolesFound')}
            </p>
          ) : (
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {roles.map((role) => {
                const id = `share-role-${role.id}`;

                return (
                  <li key={role.id} className="flex items-center gap-2 p-1">
                    <Checkbox
                      id={id}
                      checked={props.value.includes(role.id)}
                      data-testid={`role-checkbox-${role.name}`}
                      onCheckedChange={(checked) =>
                        props.onChange(
                          checked
                            ? [...props.value, role.id]
                            : props.value.filter((value) => value !== role.id),
                        )
                      }
                    />

                    <label htmlFor={id} className="text-sm">
                      {role.name}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>

      <FieldDescription>
        {selectedNames
          ? t('views.sharingWithRoles', { roles: selectedNames })
          : t('views.noRolesSelected')}
      </FieldDescription>
    </>
  );
}

function DeleteViewDialog(props: {
  schema: string;
  table: string;
  view: CmsSavedView;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { api } = useCmsApi();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      api.deleteSavedView({
        schema: props.schema,
        table: props.table,
        id: props.view.id,
      }),
    onSuccess: async () => {
      toast.success(t('views.viewDeleted'));

      await queryClient.invalidateQueries({
        queryKey: cmsQueryKeys.savedViews(props.schema, props.table),
      });

      props.onDeleted();
    },
    onError: () => toast.error(t('views.viewDeletionFailed')),
  });

  return (
    <AlertDialog open onOpenChange={props.onOpenChange}>
      <AlertDialogContent data-testid="delete-saved-view-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('views.deleteView', { name: props.view.name })}
          </AlertDialogTitle>

          <AlertDialogDescription>
            {t('views.deleteViewDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>{t('views.cancel')}</AlertDialogCancel>

          <AlertDialogAction
            render={
              <Button
                variant="destructive"
                data-testid="confirm-delete-view-button"
                disabled={mutation.isPending}
                onClick={(e) => {
                  // Se espera a la respuesta de la API antes de cerrar.
                  e.preventDefault();
                  mutation.mutate();
                }}
              />
            }
          >
            {mutation.isPending ? t('views.deletingView') : t('views.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
